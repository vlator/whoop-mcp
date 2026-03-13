import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createClient, msToHoursMinutes, formatDate, formatTime } from "./helpers";

export function registerWorkoutTools(server: McpServer) {
  server.registerTool(
    "get_whoop_workouts",
    {
      title: "Get Whoop Workouts",
      description:
        "Get workout data including strain, heart rate, calories, distance, and heart rate zone durations",
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
          .describe("Max records to return (default 10)"),
      },
    },
    async ({ start_date, end_date, limit }) => {
      try {
        const client = createClient();

        const defaultStart = new Date();
        defaultStart.setDate(defaultStart.getDate() - 7);
        const startStr = start_date || defaultStart.toISOString().split("T")[0];

        const records = await client.getWorkouts(
          startStr,
          end_date,
          limit || 10
        );

        if (records.length === 0) {
          return {
            content: [{ type: "text", text: "No workouts found for this period." }],
          };
        }

        const lines = ["Workouts:", ""];

        for (const rec of records) {
          if (!rec.score) continue;
          const s = rec.score;
          const zones = s.zone_durations;

          lines.push(
            `${formatDate(rec.start)} ${formatTime(rec.start)} - ${formatTime(rec.end)}`,
            `  ${rec.sport_name}`,
            `  Strain: ${s.strain.toFixed(1)}`,
            `  Avg HR: ${s.average_heart_rate} bpm | Max HR: ${s.max_heart_rate} bpm`,
            `  Calories: ${Math.round(s.kilojoule * 0.239)} kcal (${s.kilojoule.toFixed(0)} kJ)`,
            ...(s.distance_meter ? [`  Distance: ${(s.distance_meter / 1000).toFixed(2)} km`] : []),
            `  HR Zones:`,
            `    Zone 0 (rest): ${msToHoursMinutes(zones.zone_zero_milli)}`,
            `    Zone 1 (easy): ${msToHoursMinutes(zones.zone_one_milli)}`,
            `    Zone 2 (moderate): ${msToHoursMinutes(zones.zone_two_milli)}`,
            `    Zone 3 (hard): ${msToHoursMinutes(zones.zone_three_milli)}`,
            `    Zone 4 (very hard): ${msToHoursMinutes(zones.zone_four_milli)}`,
            `    Zone 5 (max): ${msToHoursMinutes(zones.zone_five_milli)}`,
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
