import Link from "next/link";
import { isDemoMode } from "@/env";
import { getViewer } from "@/lib/app";
import { Footer } from "@/components/Footer";
import { SCOPE_POSTS, SCOPE_INSIGHTS, SCOPE_SELF } from "@/lib/fanvue/scopes";
import { redirect } from "next/navigation";

const ERRORS: Record<string, string> = {
  not_configured:
    "This deployment has no Fanvue OAuth credentials configured yet, so connecting is disabled.",
  oauth_state_mismatch:
    "That sign-in attempt could not be verified, which usually means it took too long. Please try again.",
  oauth_exchange_failed: "Fanvue rejected the sign-in. Please try again.",
  access_denied: "You declined the permission request, so nothing was connected.",
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await getViewer();
  if (viewer) redirect("/dashboard");

  const params = await searchParams;
  const rawError = typeof params.error === "string" ? params.error : null;
  const message = rawError ? (ERRORS[rawError] ?? "Something went wrong connecting to Fanvue.") : null;
  const disconnected = params.disconnected === "1";

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo" src="/logo.svg" alt="" width={34} height={34} />
          <div>
            <h1>Streak</h1>
            <span>A habit tracker for Fanvue creators</span>
          </div>
        </div>
      </header>

      {message && <div className="notice">{message}</div>}
      {disconnected && (
        <div className="notice info">
          Disconnected. Streak no longer has access to your Fanvue account.
        </div>
      )}

      <div className="hero-landing">
        <h2>Consistency, made visible.</h2>
        <p>
          Streak reads your Fanvue posting history and turns it into a streak counter, an activity
          heatmap and a few honest numbers about how consistency tracks with earnings. Read-only,
          and yours to disconnect at any time.
        </p>
        <a className="btn-primary" href="/api/oauth/login" style={{ padding: "12px 22px", display: "inline-block", textDecoration: "none", borderRadius: 10 }}>
          Connect your Fanvue account
        </a>
        {isDemoMode() && (
          <p style={{ marginTop: 14 }}>
            <Link href="/dashboard">Or view the demo with sample data</Link>
          </p>
        )}
      </div>

      <div className="feature-list">
        <div className="card">
          <h3>🔥 Streak counter</h3>
          <p>
            Consecutive posting days in your own timezone, with three freezes a month so one day off
            does not erase a month of work.
          </p>
        </div>
        <div className="card">
          <h3>📊 Activity heatmap</h3>
          <p>Every day of the last few months at a glance, so patterns and gaps are obvious.</p>
        </div>
        <div className="card">
          <h3>📈 Consistency vs earnings</h3>
          <p>
            Whether your steadier weeks actually earn more, computed from your own data rather than
            a generic claim.
          </p>
        </div>
      </div>

      <div className="card full" style={{ marginTop: 20 }}>
        <h2>What Streak asks for</h2>
        <ul className="scope-list">
          <li>
            <code>{SCOPE_SELF}</code> — your display name and timezone, so streaks land on the right
            calendar day.
          </li>
          <li>
            <code>{SCOPE_POSTS}</code> — the dates your posts were published. Streak counts them.
            It does not read captions, media or messages.
          </li>
          <li>
            <code>{SCOPE_INSIGHTS}</code> — daily earnings totals for the consistency comparison.
            Optional: decline it and every other panel still works.
          </li>
        </ul>
        <div className="insight">
          All read-only. Streak has no write access to your account, cannot post, cannot message
          anyone and never sees your Fanvue password. Revoke access from your Fanvue settings or
          from inside Streak at any time.
        </div>
      </div>

      <Footer />
    </div>
  );
}

export const dynamic = "force-dynamic";
