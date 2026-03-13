import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createClient } from "./helpers";

export function registerRecoveryTools(server: McpServer) {
  server.registerTool(
    "get_whoop_recovery",
    {
      title: "Get Whoop Recovery",
      description:
        "Get recovery data including recovery score, HRV, resting heart rate, SpO2, and skin temperature",
      inputSchema: {
        start_date: z
          .string()
          .optional()
          .describe("Start date in YYYY-MM-DD format (defaults to last 7 days)"),
        end_date: z
          .string()
          .optional()
          .describe("End date in YYYY-MM-DD format (defaults to today)"),
        limit: z
          .number()
          .min(1)
          .max(25)
          .optional()
          .describe("Max records to return (default 7)"),
      },
    },
    async ({ start_date, end_date, limit }) => {
      try {
        const client = createClient();

        const defaultStart = new Date();
        defaultStart.setDate(defaultStart.getDate() - 7);
        const startStr = start_date || defaultStart.toISOString().split("T")[0];

        const records = await client.getRecovery(
          startStr,
          end_date,
          limit || 7
        );

        if (records.length === 0) {
          return {
            content: [{ type: "text", text: "No recovery data found for this period." }],
          };
        }

        const lines = ["Recovery data:", ""];

        for (const rec of records) {
          if (!rec.score) continue;
          const s = rec.score;
          lines.push(
            `Recovery: ${Math.round(s.recovery_score)}%`,
            `  HRV (RMSSD): ${s.hrv_rmssd_milli.toFixed(1)} ms`,
            `  Resting HR: ${Math.round(s.resting_heart_rate)} bpm`,
            ...(s.spo2_percentage != null ? [`  SpO2: ${s.spo2_percentage}%`] : []),
            ...(s.skin_temp_celsius != null ? [`  Skin Temp: ${s.skin_temp_celsius.toFixed(1)}C`] : []),
            ...(s.user_calibrating ? ["  (Still calibrating)"] : []),
            ""
          );
        }

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
