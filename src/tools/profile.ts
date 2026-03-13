import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createClient } from "./helpers";

export function registerProfileTools(server: McpServer) {
  server.registerTool(
    "get_whoop_profile",
    {
      title: "Get Whoop Profile",
      description:
        "Get the connected user's Whoop profile including name, email, and body measurements",
    },
    async () => {
      try {
        const client = createClient();
        const [profile, body] = await Promise.all([
          client.getProfile(),
          client.getBodyMeasurement(),
        ]);

        const lines = [
          `Profile: ${profile.first_name} ${profile.last_name}`,
          `Email: ${profile.email}`,
          `User ID: ${profile.user_id}`,
          "",
          "Body Measurements:",
          `  Height: ${(body.height_meter * 100).toFixed(1)} cm`,
          `  Weight: ${body.weight_kilogram.toFixed(1)} kg`,
          `  Max Heart Rate: ${body.max_heart_rate} bpm`,
        ];

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
