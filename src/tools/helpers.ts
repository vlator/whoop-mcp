import { WhoopClient } from "../whoop-client";
import { getTokens, updateTokens } from "../token-store";
import type { OAuthTokenData } from "../types";

export function createClient(): WhoopClient {
  const tokens = getTokens();
  if (!tokens) {
    const baseUrl = process.env.BASE_URL || "the server URL";
    throw new Error(
      `Not authenticated. Visit ${baseUrl} to connect your WHOOP account.`
    );
  }

  return new WhoopClient(tokens, (newTokens: OAuthTokenData) => {
    updateTokens(newTokens);
  });
}

export function msToHoursMinutes(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

export function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
