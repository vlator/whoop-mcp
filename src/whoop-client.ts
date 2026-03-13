import type {
  OAuthTokenData,
  WhoopProfile,
  WhoopBodyMeasurement,
  WhoopRecovery,
  WhoopSleep,
  WhoopWorkout,
  WhoopCycle,
  PaginatedResponse,
} from "./types";

const BASE_URL = "https://api.prod.whoop.com/developer/v2";
const TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";

export class WhoopClient {
  private tokens: OAuthTokenData;
  private onTokenRefresh: (tokens: OAuthTokenData) => void;

  constructor(
    tokens: OAuthTokenData,
    onTokenRefresh: (tokens: OAuthTokenData) => void
  ) {
    this.tokens = tokens;
    this.onTokenRefresh = onTokenRefresh;
  }

  private async refreshToken(): Promise<void> {
    const clientId = process.env.WHOOP_CLIENT_ID;
    const clientSecret = process.env.WHOOP_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET are required");
    }

    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: this.tokens.refresh_token,
        client_id: clientId,
        client_secret: clientSecret,
        scope: "offline",
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Token refresh failed: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      scope: string;
    };

    this.tokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
      scope: data.scope,
    };

    this.onTokenRefresh(this.tokens);
  }

  private async ensureValidToken(): Promise<void> {
    const expiresInMs = this.tokens.expires_at - Date.now();
    if (expiresInMs < 5 * 60 * 1000) {
      await this.refreshToken();
    }
  }

  private async get<T>(
    path: string,
    params?: Record<string, string>
  ): Promise<T> {
    await this.ensureValidToken();

    const url = new URL(`${BASE_URL}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value) url.searchParams.set(key, value);
      }
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.tokens.access_token}`,
      },
    });

    if (response.status === 401) {
      await this.refreshToken();
      const retryResponse = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${this.tokens.access_token}`,
        },
      });
      if (!retryResponse.ok) {
        throw new Error(
          `Whoop API error: ${retryResponse.status} ${retryResponse.statusText}`
        );
      }
      return retryResponse.json() as Promise<T>;
    }

    if (!response.ok) {
      throw new Error(
        `Whoop API error: ${response.status} ${response.statusText}`
      );
    }

    return response.json() as Promise<T>;
  }

  private async getPaginated<T>(
    path: string,
    params?: Record<string, string>,
    maxRecords?: number
  ): Promise<T[]> {
    const allRecords: T[] = [];
    let nextToken: string | undefined;

    do {
      const queryParams = { ...params };
      if (nextToken) queryParams.nextToken = nextToken;

      const response = await this.get<PaginatedResponse<T>>(path, queryParams);
      allRecords.push(...response.records);
      nextToken = response.next_token;

      if (maxRecords && allRecords.length >= maxRecords) {
        return allRecords.slice(0, maxRecords);
      }
    } while (nextToken);

    return allRecords;
  }

  async getProfile(): Promise<WhoopProfile> {
    return this.get<WhoopProfile>("/user/profile/basic");
  }

  async getBodyMeasurement(): Promise<WhoopBodyMeasurement> {
    return this.get<WhoopBodyMeasurement>("/user/measurement/body");
  }

  async getRecovery(
    startDate?: string,
    endDate?: string,
    limit?: number
  ): Promise<WhoopRecovery[]> {
    const params: Record<string, string> = {};
    if (startDate) params.start = new Date(startDate).toISOString();
    if (endDate) params.end = new Date(endDate).toISOString();
    if (limit) params.limit = String(Math.min(limit, 25));
    return this.getPaginated<WhoopRecovery>("/recovery", params, limit);
  }

  async getSleep(
    startDate?: string,
    endDate?: string,
    limit?: number
  ): Promise<WhoopSleep[]> {
    const params: Record<string, string> = {};
    if (startDate) params.start = new Date(startDate).toISOString();
    if (endDate) params.end = new Date(endDate).toISOString();
    if (limit) params.limit = String(Math.min(limit, 25));
    return this.getPaginated<WhoopSleep>("/activity/sleep", params, limit);
  }

  async getWorkouts(
    startDate?: string,
    endDate?: string,
    limit?: number
  ): Promise<WhoopWorkout[]> {
    const params: Record<string, string> = {};
    if (startDate) params.start = new Date(startDate).toISOString();
    if (endDate) params.end = new Date(endDate).toISOString();
    if (limit) params.limit = String(Math.min(limit, 25));
    return this.getPaginated<WhoopWorkout>("/activity/workout", params, limit);
  }

  async getCycles(
    startDate?: string,
    endDate?: string,
    limit?: number
  ): Promise<WhoopCycle[]> {
    const params: Record<string, string> = {};
    if (startDate) params.start = new Date(startDate).toISOString();
    if (endDate) params.end = new Date(endDate).toISOString();
    if (limit) params.limit = String(Math.min(limit, 25));
    return this.getPaginated<WhoopCycle>("/cycle", params, limit);
  }
}
