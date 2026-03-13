import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createClient, msToHoursMinutes } from "./helpers";

function recoveryZone(score: number): string {
  if (score >= 67) return "Green";
  if (score >= 34) return "Yellow";
  return "Red";
}

export function registerOverviewTool(server: McpServer) {
  server.registerTool(
    "get_whoop_overview",
    {
      title: "Get Whoop Daily Overview",
      description:
        "Get a comprehensive daily overview with the most recent recovery score (HRV, RHR, SpO2), last night's sleep (performance, stages, efficiency, consistency, disturbances), day strain, and recent workouts. Designed for a morning brief — no parameters needed.",
    },
    async () => {
      try {
        const client = createClient();

        const now = new Date();
        const twoDaysAgo = new Date(now);
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
        const startDate = twoDaysAgo.toISOString();
        const endDate = now.toISOString();

        const [recoveries, sleeps, workouts, cycles] = await Promise.all([
          client.getRecovery(startDate, endDate, 2),
          client.getSleep(startDate, endDate, 5),
          client.getWorkouts(startDate, endDate, 10),
          client.getCycles(startDate, endDate, 2),
        ]);

        const lines: string[] = [];

        // Recovery
        const recovery = recoveries.find((r) => r.score);
        if (recovery?.score) {
          const s = recovery.score;
          const score = Math.round(s.recovery_score);
          let line = `Recovery: ${score}% ${recoveryZone(score)}`;
          line += ` · HRV ${s.hrv_rmssd_milli.toFixed(0)}ms`;
          line += ` · RHR ${Math.round(s.resting_heart_rate)}bpm`;
          if (s.spo2_percentage != null) line += ` · SpO2 ${s.spo2_percentage}%`;
          if (s.skin_temp_celsius != null) line += ` · Skin ${s.skin_temp_celsius.toFixed(1)}C`;
          if (s.user_calibrating) line += " (calibrating)";
          lines.push(line);
        } else {
          lines.push("Recovery: Not yet scored");
        }

        // Sleep
        const primarySleep = sleeps.find((s) => !s.nap && s.score);
        if (primarySleep?.score) {
          const s = primarySleep.score;
          const stages = s.stage_summary;

          const totalSleep =
            stages.total_light_sleep_time_milli +
            stages.total_slow_wave_sleep_time_milli +
            stages.total_rem_sleep_time_milli;

          let line = "Sleep:";
          if (s.sleep_performance_percentage != null) {
            line += ` ${Math.round(s.sleep_performance_percentage)}%`;
          }
          line += ` · ${msToHoursMinutes(totalSleep)}`;
          if (s.sleep_efficiency_percentage != null) {
            line += ` · ${Math.round(s.sleep_efficiency_percentage)}% efficiency`;
          }
          line += ` · ${stages.disturbance_count} disturbances`;
          if (s.sleep_consistency_percentage != null) {
            line += ` · Consistency ${Math.round(s.sleep_consistency_percentage)}%`;
          }
          lines.push(line);
        } else {
          lines.push("Sleep: No data available");
        }

        // Day strain
        const cycle = cycles.find((c) => c.score);
        if (cycle?.score) {
          lines.push(`Strain: ${cycle.score.strain.toFixed(1)}`);
        }

        // Workouts — only scored, omit line entirely if none
        const scoredWorkouts = workouts.filter((w) => w.score);
        for (const w of scoredWorkouts) {
          const s = w.score!;
          const durationMs =
            new Date(w.end).getTime() - new Date(w.start).getTime();
          const durationMin = Math.round(durationMs / (1000 * 60));

          let line = `Workout: ${w.sport_name} · ${durationMin} min · Strain ${s.strain.toFixed(1)} · ${Math.round(s.kilojoule * 0.239)} kcal`;
          if (s.distance_meter) {
            line += ` · ${(s.distance_meter / 1000).toFixed(2)} km`;
          }
          lines.push(line);
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
