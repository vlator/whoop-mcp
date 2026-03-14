import { readFileSync, writeFileSync, mkdirSync } from "fs";
import type { OAuthTokenData } from "./types";

interface StoredAuth {
  tokens: OAuthTokenData;
  whoop_user_id?: number;
}

const TOKEN_FILE = "./data/tokens.json";
let storedAuth: StoredAuth | null = null;

export function loadTokens(): void {
  try {
    const data = readFileSync(TOKEN_FILE, "utf-8");
    storedAuth = JSON.parse(data);
    const expiresIn = storedAuth?.tokens
      ? Math.round((storedAuth.tokens.expires_at - Date.now()) / 1000 / 60)
      : 0;
    console.log(
      `[tokens] Loaded from disk — expires in ${expiresIn} min, user_id: ${storedAuth?.whoop_user_id ?? "unknown"}`
    );
  } catch {
    console.log("[tokens] No saved tokens found, fresh start");
  }
}

function saveTokens(): void {
  try {
    mkdirSync("./data", { recursive: true });
    writeFileSync(TOKEN_FILE, JSON.stringify(storedAuth, null, 2));
  } catch (error) {
    console.error("Failed to save tokens:", error);
  }
}

export function getTokens(): OAuthTokenData | null {
  return storedAuth?.tokens ?? null;
}

export function getWhoopUserId(): number | undefined {
  return storedAuth?.whoop_user_id;
}

export function setAuth(tokens: OAuthTokenData, whoopUserId?: number): void {
  storedAuth = { tokens, whoop_user_id: whoopUserId };
  saveTokens();
  console.log(`[tokens] Auth saved — user_id: ${whoopUserId ?? "unknown"}, expires in ${Math.round((tokens.expires_at - Date.now()) / 1000 / 60)} min`);
}

export function updateTokens(tokens: OAuthTokenData): void {
  if (storedAuth) {
    storedAuth.tokens = tokens;
    saveTokens();
    console.log(`[tokens] Refreshed — expires in ${Math.round((tokens.expires_at - Date.now()) / 1000 / 60)} min`);
  }
}

export function isConnected(): boolean {
  return storedAuth !== null;
}

export function disconnect(): void {
  storedAuth = null;
  saveTokens();
}
