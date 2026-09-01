import { env } from "@/env";

export class FanvueApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
  ) {
    super(`Fanvue API ${path} returned ${status}`);
    this.name = "FanvueApiError";
  }
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

function backoffMs(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 20_000);
  }
  return Math.min(500 * 2 ** attempt, 8_000);
}

/**
 * Thin authenticated wrapper over the Fanvue API.
 *
 * Deliberately never logs the token, the Authorization header, or response
 * bodies: those carry creator data and are out of scope for application logs.
 */
export class FanvueClient {
  constructor(private accessToken: string) {}

  async get<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
    const url = new URL(path, env.API_BASE_URL);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    let lastStatus = 0;
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          // Setting API_VERSION to an empty string omits the header, so a wrong
          // pinned version can be dropped without a code change.
          ...(env.API_VERSION ? { "X-Fanvue-API-Version": env.API_VERSION } : {}),
          Accept: "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });

      if (res.ok) return (await res.json()) as T;

      lastStatus = res.status;
      if (!RETRYABLE.has(res.status) || attempt === 3) break;
      await new Promise((r) => setTimeout(r, backoffMs(attempt, res.headers.get("retry-after"))));
    }
    throw new FanvueApiError(lastStatus, path);
  }
}

/**
 * Response envelopes differ per endpoint and per API version. Rather than
 * hard-coding one shape, pull the first array we recognise. If none matches the
 * caller gets an empty list and a warning, not a crash.
 */
export function extractList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    for (const key of ["data", "items", "results", "records", "posts"]) {
      const value = (payload as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

/** Cursor or page token, whatever the endpoint happens to call it. */
export function extractNextCursor(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  const pagination = (obj.pagination ?? obj.meta ?? obj) as Record<string, unknown>;
  for (const key of ["nextCursor", "next_cursor", "cursor", "nextPage", "next"]) {
    const value = pagination?.[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

export function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

export function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return null;
}
