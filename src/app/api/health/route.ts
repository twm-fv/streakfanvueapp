import { NextResponse } from "next/server";
import { env, isDemoMode } from "@/env";
import { usingDurableStore } from "@/lib/store";

/**
 * Liveness and configuration probe.
 *
 * Reports which expected settings are missing, by name, so a misconfigured
 * deployment says what is wrong instead of failing quietly at runtime. Values
 * are never reported - only whether a name is set.
 */
export async function GET() {
  const durable = usingDurableStore();
  const demo = isDemoMode();
  const production = process.env.NODE_ENV === "production";
  const warnings: string[] = [];

  if (production && !durable) {
    const missing = [
      !env.UPSTASH_REDIS_REST_URL && "UPSTASH_REDIS_REST_URL",
      !env.UPSTASH_REDIS_REST_TOKEN && "UPSTASH_REDIS_REST_TOKEN",
    ].filter(Boolean);
    warnings.push(
      `Using the file store in production, so sessions will not survive. Missing: ${missing.join(", ")}. ` +
        `Add in your host's environment settings, then redeploy - environment changes do not rebuild on their own.`,
    );
  }

  if (!demo) {
    const missing = [
      !env.OAUTH_CLIENT_ID && "OAUTH_CLIENT_ID",
      !env.OAUTH_CLIENT_SECRET && "OAUTH_CLIENT_SECRET",
      !env.OAUTH_REDIRECT_URI && "OAUTH_REDIRECT_URI",
      !env.BASE_URL && "BASE_URL",
    ].filter(Boolean);
    if (missing.length) {
      warnings.push(`Cannot connect a Fanvue account yet. Missing: ${missing.join(", ")}.`);
    }
  }

  // Placeholders reach the footer and both legal pages, which a reviewer reads.
  const placeholders = [
    env.VENDOR_NAME === "the Streak team" && "VENDOR_NAME",
    env.SUPPORT_EMAIL === "support@example.com" && "SUPPORT_EMAIL",
  ].filter(Boolean);
  if (production && placeholders.length) {
    warnings.push(`Still showing placeholder listing details. Set: ${placeholders.join(", ")}.`);
  }

  if (demo && production) {
    warnings.push("DEMO_MODE is enabled in production. Sample data is being served, not real data.");
  }

  return NextResponse.json({
    status: "ok",
    storage: durable ? "redis" : "file",
    demoMode: demo,
    oauthConfigured: Boolean(env.OAUTH_CLIENT_ID && env.OAUTH_CLIENT_SECRET && env.OAUTH_REDIRECT_URI),
    ready: warnings.length === 0,
    warnings,
  });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
