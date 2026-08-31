import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Streak is an independent third-party Fanvue app. Everything Fanvue-owned
 * (issuer, API host) has a safe default; everything app-owned must be supplied.
 *
 * DEMO_MODE lets the app run end-to-end with generated sample data so the UI can
 * be reviewed without holding anyone's real credentials. It never talks to Fanvue.
 */
export const env = createEnv({
  server: {
    // --- OAuth client (from https://fanvue.com/developers/apps) ---
    OAUTH_CLIENT_ID: z.string().min(1).optional(),
    OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
    OAUTH_ISSUER_BASE_URL: z.url().default("https://auth.fanvue.com"),
    OAUTH_REDIRECT_URI: z.url().optional(),
    /** Space separated. Must exactly match the scopes selected in the Fanvue developer UI. */
    OAUTH_SCOPES: z.string().default("read:self"),

    // --- Fanvue API ---
    API_BASE_URL: z.url().default("https://api.fanvue.com"),
    API_VERSION: z.string().default("2025-06-26"),
    /** Endpoint paths are overridable so a docs change does not require a code change. */
    API_POSTS_PATH: z.string().default("/posts"),
    API_INSIGHTS_EARNINGS_PATH: z.string().default("/insights/earnings"),

    // --- This app ---
    BASE_URL: z.url().optional(),
    /** Shown in the footer and legal pages. Required for an App Store listing. */
    VENDOR_NAME: z.string().default("the Streak team"),
    SUPPORT_EMAIL: z.string().default("support@example.com"),
    SESSION_COOKIE_NAME: z.string().default("streak_sid"),
    /** Root secret. Cookie signing and at-rest token encryption keys are derived from it via HKDF. */
    SESSION_SECRET: z.string().min(32, {
      message: "SESSION_SECRET must be at least 32 characters",
    }),
    /** Where the file-backed store writes. Swap the store for a database in production. */
    DATA_DIR: z.string().default(".data"),
    DEMO_MODE: z
      .string()
      .optional()
      .transform((v) => v === "true" || v === "1"),
    /** Days of history to pull and analyse. */
    HISTORY_DAYS: z.coerce.number().int().min(30).max(730).default(140),
  },
  runtimeEnv: {
    OAUTH_CLIENT_ID: process.env.OAUTH_CLIENT_ID,
    OAUTH_CLIENT_SECRET: process.env.OAUTH_CLIENT_SECRET,
    OAUTH_ISSUER_BASE_URL: process.env.OAUTH_ISSUER_BASE_URL,
    OAUTH_REDIRECT_URI: process.env.OAUTH_REDIRECT_URI,
    OAUTH_SCOPES: process.env.OAUTH_SCOPES,
    API_BASE_URL: process.env.API_BASE_URL,
    API_VERSION: process.env.API_VERSION,
    API_POSTS_PATH: process.env.API_POSTS_PATH,
    API_INSIGHTS_EARNINGS_PATH: process.env.API_INSIGHTS_EARNINGS_PATH,
    BASE_URL: process.env.BASE_URL,
    VENDOR_NAME: process.env.VENDOR_NAME,
    SUPPORT_EMAIL: process.env.SUPPORT_EMAIL,
    SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME,
    SESSION_SECRET: process.env.SESSION_SECRET,
    DATA_DIR: process.env.DATA_DIR,
    DEMO_MODE: process.env.DEMO_MODE,
    HISTORY_DAYS: process.env.HISTORY_DAYS,
  },
  emptyStringAsUndefined: true,
});

export type OAuthConfig = {
  issuerBaseURL: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

/**
 * Throws a clear, actionable error instead of letting an undefined client id
 * reach the authorize URL as the string "undefined".
 */
export function requireOAuthConfig(): OAuthConfig {
  const missing: string[] = [];
  if (!env.OAUTH_CLIENT_ID) missing.push("OAUTH_CLIENT_ID");
  if (!env.OAUTH_CLIENT_SECRET) missing.push("OAUTH_CLIENT_SECRET");
  if (!env.OAUTH_REDIRECT_URI) missing.push("OAUTH_REDIRECT_URI");
  if (missing.length) {
    throw new Error(
      `Missing ${missing.join(", ")}. Create an app at https://fanvue.com/developers/apps, ` +
        `or set DEMO_MODE=true to explore the UI with sample data.`,
    );
  }
  return {
    issuerBaseURL: env.OAUTH_ISSUER_BASE_URL,
    clientId: env.OAUTH_CLIENT_ID!,
    clientSecret: env.OAUTH_CLIENT_SECRET!,
    redirectUri: env.OAUTH_REDIRECT_URI!,
  };
}

export const isDemoMode = () => env.DEMO_MODE === true;
