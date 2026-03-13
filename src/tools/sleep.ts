import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createClient, msToHoursMinutes, formatDate } from "./helpers";

export function registerSleepTools(server: McpServer) {
  server.registerTool(
    "get_whoop_sleep",
    {
      title: "Get Whoop Sleep",
      description:
        "Get sleep data including performance, efficiency, consistency, sleep stages, respiratory rate, and disturbances",
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

        const records = await client.getSleep(startStr, end_date, limit || 7);

        if (records.length === 0) {
          return {
            content: [{ type: "text", text: "No sleep data found for this period." }],
          };
        }

        const lines = ["Sleep data:", ""];

        for (const rec of records) {
          if (!rec.score) continue;
          const s = rec.score;
          const stages = s.stage_summary;
          const needed = s.sleep_needed;

          const totalSleep =
            stages.total_light_sleep_time_milli +
            stages.total_slow_wave_sleep_time_milli +
            stages.total_rem_sleep_time_milli;

          const totalNeeded =
            needed.baseline_milli +
            needed.need_from_sleep_debt_milli +
            needed.need_from_recent_strain_milli +
            needed.need_from_recent_nap_milli;

          lines.push(
            `${formatDate(rec.start)}${rec.nap ? " (Nap)" : ""}`,
            ...(s.sleep_performance_percentage != null
              ? [`  Performance: ${Math.round(s.sleep_performance_percentage)}%`]
              : []),
            `  Total Sleep: ${msToHoursMinutes(totalSleep)} (needed: ${msToHoursMinutes(totalNeeded)})`,
            `  In Bed: ${msToHoursMinutes(stages.total_in_bed_time_milli)}`,
            ...(s.sleep_efficiency_percentage != null
              ? [`  Efficiency: ${Math.round(s.sleep_efficiency_percentage)}%`]
              : []),
            ...(s.sleep_consistency_percentage != null
              ? [`  Consistency: ${Math.round(s.sleep_consistency_percentage)}%`]
              : []),
            `  Stages:`,
            `    Light: ${msToHoursMinutes(stages.total_light_sleep_time_milli)}`,
            `    Deep (SWS): ${msToHoursMinutes(stages.total_slow_wave_sleep_time_milli)}`,
            `    REM: ${msToHoursMinutes(stages.total_rem_sleep_time_milli)}`,
            `    Awake: ${msToHoursMinutes(stages.total_awake_time_milli)}`,
            `  Cycles: ${stages.sleep_cycle_count} | Disturbances: ${stages.disturbance_count}`,
            ...(s.respiratory_rate != null
              ? [`  Respiratory Rate: ${s.respiratory_rate.toFixed(1)} breaths/min`]
              : []),
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
