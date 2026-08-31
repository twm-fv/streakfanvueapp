import { NextResponse } from "next/server";
import { env } from "@/env";

/**
 * Defence in depth on top of the SameSite=Lax session cookie: a state-changing
 * request must come from this app's own origin.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // Same-origin fetches may omit Origin entirely.
  const expected = env.BASE_URL ?? new URL(request.url).origin;
  try {
    return new URL(origin).origin === new URL(expected).origin;
  } catch {
    return false;
  }
}

export function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

type Bucket = { tokens: number; updatedAt: number };
const buckets = new Map<string, Bucket>();

/**
 * Small in-process limiter so one session cannot hammer the Fanvue API through
 * this app. A multi-instance deployment should back this with shared storage.
 */
export function rateLimit(key: string, limit = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: limit, updatedAt: now };
  const refill = ((now - bucket.updatedAt) / windowMs) * limit;
  bucket.tokens = Math.min(limit, bucket.tokens + refill);
  bucket.updatedAt = now;
  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    return false;
  }
  bucket.tokens -= 1;
  buckets.set(key, bucket);
  return true;
}
