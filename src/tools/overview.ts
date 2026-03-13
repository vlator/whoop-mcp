import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createClient, msToHoursMinutes } from "./helpers";

const TZ = "America/New_York";

function recoveryZone(score: number): string {
  if (score >= 67) return "Green";
  if (score >= 34) return "Yellow";
  return "Red";
}

/** Get YYYY-MM-DD in ET for today and yesterday */
function etDates(): { today: string; yesterday: string } {
  const now = new Date();
  const today = now.toLocaleDateString("en-CA", { timeZone: TZ });
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = yesterdayDate.toLocaleDateString("en-CA", { timeZone: TZ });
  return { today, yesterday };
}

/** Convert YYYY-MM-DD to ISO timestamp at midnight ET */
function etMidnightToISO(dateStr: string): string {
  // Use Intl to find the UTC offset for this date in ET
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(`${dateStr}T12:00:00Z`));

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value || "0";
  const etNoon = new Date(
    `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}Z`
  );
  const utcNoon = new Date(`${dateStr}T12:00:00Z`);
  const offsetMs = utcNoon.getTime() - etNoon.getTime();

  return new Date(new Date(`${dateStr}T00:00:00Z`).getTime() + offsetMs).toISOString();
}

function formatSportName(name: string): string {
  return name
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function registerOverviewTool(server: McpServer) {
  server.registerTool(
    "get_whoop_overview",
    {
      title: "Get Whoop Daily Overview",
      description:
        "Get today's recovery, sleep, strain, and workouts plus a yesterday snapshot. Designed for a morning brief — no parameters needed. All dates use America/New_York timezone.",
    },
    async () => {
      try {
        const client = createClient();

        const { today, yesterday } = etDates();
        const yesterdayStart = etMidnightToISO(yesterday);
        const todayStart = etMidnightToISO(today);
        const tomorrowDate = new Date(today);
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);
        const tomorrowStart = etMidnightToISO(
          tomorrowDate.toISOString().split("T")[0]!
        );

        // Fetch everything from yesterday start through now
        const [recoveries, sleeps, todayWorkouts, yesterdayWorkouts, cycles] =
          await Promise.all([
            client.getRecovery(yesterdayStart, tomorrowStart, 5),
            client.getSleep(yesterdayStart, tomorrowStart, 5),
            client.getWorkouts(todayStart, tomorrowStart, 10),
            client.getWorkouts(yesterdayStart, todayStart, 10),
            client.getCycles(yesterdayStart, tomorrowStart, 3),
          ]);

        const lines: string[] = [];

        // --- TODAY ---

        // Recovery — most recent scored
        const recovery = recoveries.find((r) => r.score);
        if (recovery?.score) {
          const s = recovery.score;
          const score = Math.round(s.recovery_score);
          let line = `Recovery: ${score}% ${recoveryZone(score)}`;
          line += ` · HRV ${s.hrv_rmssd_milli.toFixed(0)}ms`;
          line += ` · RHR ${Math.round(s.resting_heart_rate)}bpm`;
          if (s.spo2_percentage != null)
            line += ` · SpO2 ${Math.round(s.spo2_percentage)}%`;
          if (s.skin_temp_celsius != null)
            line += ` · Skin ${s.skin_temp_celsius.toFixed(1)}C`;
          if (s.user_calibrating) line += " (calibrating)";
          lines.push(line);
        } else {
          lines.push("Recovery: Not yet scored");
        }

        // Sleep — most recent primary sleep
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

        // Day strain — today's cycle
        const todayCycle = cycles.find((c) => {
          const cStart = new Date(c.start).getTime();
          return cStart >= new Date(todayStart).getTime() && cStart < new Date(tomorrowStart).getTime();
        });
        if (todayCycle) {
          const isFinal = !!todayCycle.end;
          const strainVal = todayCycle.score
            ? todayCycle.score.strain.toFixed(1)
            : "0.0";
          lines.push(`Strain: ${strainVal} (${isFinal ? "final" : "in progress"})`);
        } else {
          lines.push("Strain: 0.0 (in progress)");
        }

        // Workouts — today only (ET)
        const scoredToday = todayWorkouts.filter((w) => w.score);
        if (scoredToday.length > 0) {
          for (const w of scoredToday) {
            const s = w.score!;
            const durationMs =
              new Date(w.end).getTime() - new Date(w.start).getTime();
            const durationMin = Math.round(durationMs / (1000 * 60));

            let line = `Workout: ${formatSportName(w.sport_name)} · ${durationMin} min · Strain ${s.strain.toFixed(1)} · ${Math.round(s.kilojoule * 0.239)} kcal`;
            if (s.distance_meter) {
              line += ` · ${(s.distance_meter / 1000).toFixed(2)} km`;
            }
            lines.push(line);
          }
        } else {
          lines.push("No workouts logged yet today.");
        }

        // --- YESTERDAY ---
        // Find yesterday's recovery (second most recent, or the one after today's)
        const yesterdayRecovery =
          recoveries.length > 1
            ? recoveries.find((r, i) => i > 0 && r.score)
            : null;

        // Yesterday's sleep — second primary sleep
        const yesterdaySleep = sleeps.filter((s) => !s.nap && s.score);
        const ySleep = yesterdaySleep.length > 1 ? yesterdaySleep[1] : null;

        // Yesterday's cycle
        const yCycle = cycles.find((c) => {
          const cStart = new Date(c.start).getTime();
          return cStart >= new Date(yesterdayStart).getTime() && cStart < new Date(todayStart).getTime();
        });

        const yWorkoutCount = yesterdayWorkouts.filter((w) => w.score).length;

        const yParts: string[] = [];
        if (yesterdayRecovery?.score) {
          const s = yesterdayRecovery.score;
          yParts.push(`Recovery ${Math.round(s.recovery_score)}%`);
          yParts.push(`HRV ${s.hrv_rmssd_milli.toFixed(0)}ms`);
        }
        if (ySleep?.score) {
          const s = ySleep.score;
          const totalSleep =
            s.stage_summary.total_light_sleep_time_milli +
            s.stage_summary.total_slow_wave_sleep_time_milli +
            s.stage_summary.total_rem_sleep_time_milli;
          if (s.sleep_performance_percentage != null) {
            yParts.push(`Sleep ${Math.round(s.sleep_performance_percentage)}%`);
          }
          yParts.push(msToHoursMinutes(totalSleep));
        }
        if (yCycle?.score) {
          yParts.push(`Strain ${yCycle.score.strain.toFixed(1)}`);
        }
        if (yWorkoutCount > 0) {
          yParts.push(
            `${yWorkoutCount} workout${yWorkoutCount > 1 ? "s" : ""}`
          );
        }

        if (yParts.length > 0) {
          lines.push(`Yesterday: ${yParts.join(" · ")}`);
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
