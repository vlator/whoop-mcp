import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import crypto from "crypto";
import { createWhoopMcpServer } from "./src/server";
import { loadTokens, setAuth, isConnected } from "./src/token-store";
import type { OAuthTokenData, OAuthTokenResponse } from "./src/types";

// Load persisted tokens on startup
loadTokens();

const app = express();
app.use(express.json());

const WHOOP_AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
const SCOPES =
  "read:profile read:body_measurement read:cycles read:recovery read:sleep read:workout offline";

// Pending OAuth states
const pendingOAuth = new Map<string, boolean>();

function getBaseUrl(): string {
  return (
    process.env.BASE_URL ||
    `http://localhost:${process.env.PORT || "3000"}`
  );
}

function getRedirectUri(): string {
  return `${getBaseUrl()}/auth/whoop/callback`;
}

// Landing page
app.get("/", (_req, res) => {
  const connected = isConnected();
  const statusHtml = connected
    ? `<div class="card connected"><p>Whoop account connected.</p></div>`
    : `<div class="card"><p>No account connected yet.</p></div>`;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WHOOP MCP Server</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 700px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; }
    h1 { font-size: 1.8rem; }
    .card { background: #f5f5f5; border-radius: 8px; padding: 16px 20px; margin: 16px 0; }
    .card.connected { background: #f0faf0; }
    .config { background: #1a1a1a; color: #e0e0e0; border-radius: 8px; padding: 16px; font-family: monospace; font-size: 0.85rem; white-space: pre; overflow-x: auto; }
    button, .btn { display: inline-block; padding: 8px 20px; background: #1a1a1a; color: white; border: none; border-radius: 4px; font-size: 1rem; cursor: pointer; text-decoration: none; }
    button:hover, .btn:hover { background: #333; }
  </style>
</head>
<body>
  <h1>WHOOP MCP Server</h1>
  <p>Connect your WHOOP account to use with Claude.</p>

  ${statusHtml}
  <a class="btn" href="/auth/whoop">${connected ? "Reconnect" : "Connect"} WHOOP</a>

  <h2>Claude Desktop Configuration</h2>
  <p>Add this to your Claude Desktop config:</p>
  <div class="config">{
  "mcpServers": {
    "whoop": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "${escapeHtml(getBaseUrl())}/mcp"]
    }
  }
}</div>
</body>
</html>`);
});

// OAuth initiation
app.get("/auth/whoop", (_req, res) => {
  const clientId = process.env.WHOOP_CLIENT_ID;
  if (!clientId) {
    return res.status(500).send("WHOOP_CLIENT_ID not configured");
  }

  const state = crypto.randomBytes(16).toString("hex");
  pendingOAuth.set(state, true);

  // Clean up stale states after 10 minutes
  setTimeout(() => pendingOAuth.delete(state), 10 * 60 * 1000);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: SCOPES,
    state,
  });

  res.redirect(`${WHOOP_AUTH_URL}?${params}`);
});

// OAuth callback
app.get("/auth/whoop/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.status(400).send(`OAuth error: ${escapeHtml(String(error))}`);
  }

  if (!code || !state) {
    return res.status(400).send("Missing code or state parameter");
  }

  if (!pendingOAuth.has(state as string)) {
    return res
      .status(400)
      .send("Invalid or expired OAuth state. Please try again.");
  }
  pendingOAuth.delete(state as string);

  const clientId = process.env.WHOOP_CLIENT_ID;
  const clientSecret = process.env.WHOOP_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res
      .status(500)
      .send("WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET not configured");
  }

  try {
    const tokenResponse = await fetch(WHOOP_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code as string,
        redirect_uri: getRedirectUri(),
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenResponse.ok) {
      const body = await tokenResponse.text();
      console.error("Token exchange failed:", tokenResponse.status, body);
      return res
        .status(500)
        .send("Failed to exchange authorization code for tokens");
    }

    const tokenData = (await tokenResponse.json()) as OAuthTokenResponse;

    const tokens: OAuthTokenData = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: Date.now() + tokenData.expires_in * 1000,
      scope: tokenData.scope,
    };

    // Fetch profile to store user ID
    let whoopUserId: number | undefined;
    try {
      const profileResponse = await fetch(
        "https://api.prod.whoop.com/developer/v2/user/profile/basic",
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );
      if (profileResponse.ok) {
        const profile = (await profileResponse.json()) as {
          user_id: number;
        };
        whoopUserId = profile.user_id;
      }
    } catch {
      // Non-critical
    }

    setAuth(tokens, whoopUserId);
    res.redirect("/");
  } catch (error) {
    console.error("OAuth callback error:", error);
    res.status(500).send("An error occurred during authentication");
  }
});

// Auth middleware — protects /mcp only. Checks Bearer header first, falls back to ?token= query param.
function verifyMcpAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const mcpAuthToken = process.env.MCP_AUTH_TOKEN;
  if (!mcpAuthToken) return next();

  // Try Bearer header first
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const [scheme, headerToken] = authHeader.split(" ");
    if (scheme === "Bearer" && headerToken) {
      token = headerToken;
    }
  }

  // Fall back to query param
  if (!token && req.query.token) {
    token = req.query.token as string;
  }

  if (!token) {
    return res
      .status(401)
      .json({ error: "Unauthorized", message: "Token required via Authorization header or ?token= query param" });
  }

  try {
    const expected = Buffer.from(mcpAuthToken, "utf-8");
    const received = Buffer.from(token, "utf-8");
    if (
      expected.length !== received.length ||
      !crypto.timingSafeEqual(expected, received)
    ) {
      return res
        .status(401)
        .json({ error: "Unauthorized", message: "Invalid token" });
    }
  } catch {
    return res
      .status(401)
      .json({ error: "Unauthorized", message: "Invalid token" });
  }

  next();
}

// MCP endpoint — auth protected
app.post("/mcp", verifyMcpAuth, async (req, res) => {
  const server = createWhoopMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on("close", () => {
    transport.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const port = parseInt(process.env.PORT || "3000");
app
  .listen(port, () => {
    console.log(`Whoop MCP Server running on http://localhost:${port}`);
    console.log(`\nRequired env vars: WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, BASE_URL`);
    console.log(`Optional: MCP_AUTH_TOKEN, PORT`);
  })
  .on("error", (error) => {
    console.error("Server error:", error);
    process.exit(1);
  });

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
