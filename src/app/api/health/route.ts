import { NextResponse } from "next/server";
import { isDemoMode } from "@/env";
import { usingDurableStore } from "@/lib/store";

/**
 * Liveness and configuration probe. Useful for confirming a fresh deployment
 * picked up its environment. Reports no secrets and no creator data.
 */
export async function GET() {
  const durable = usingDurableStore();
  const demo = isDemoMode();
  return NextResponse.json({
    status: "ok",
    storage: durable ? "redis" : "file",
    demoMode: demo,
    // A serverless deployment on the file store loses data between requests.
    warnings: [
      !durable && process.env.NODE_ENV === "production"
        ? "Using the file store in production. Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN."
        : null,
      demo && process.env.NODE_ENV === "production"
        ? "DEMO_MODE is enabled in production. Creator data is not being served."
        : null,
    ].filter(Boolean),
  });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
