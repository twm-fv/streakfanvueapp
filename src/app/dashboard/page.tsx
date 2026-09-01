import { redirect } from "next/navigation";
import { buildDashboard, getViewer } from "@/lib/app";
import { MILESTONES } from "@/lib/streak/engine";
import { Footer } from "@/components/Footer";
import { Heatmap } from "@/components/Heatmap";
import { ConsistencyChart } from "@/components/ConsistencyChart";
import { StreakHero } from "@/components/StreakHero";
import { Badges } from "@/components/Badges";
import { NudgeCard } from "@/components/NudgeCard";
import { AccountCard } from "@/components/AccountCard";
import { Insights } from "@/components/Insights";
import { env } from "@/env";

/** Amounts arrive in major units already; creators are not all paid in USD. */
function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${Math.round(amount).toLocaleString("en-US")} ${currency}`;
  }
}

export default async function Dashboard() {
  const viewer = await getViewer();
  if (!viewer) redirect("/");

  const { summary, state, insights, reminders, warnings, earningsAvailable, currency, postsFound } =
    await buildDashboard(viewer);
  const money = (amount: number) => formatMoney(amount, currency);
  const { correlation, comeback, bests } = summary;
  const nextMilestone = MILESTONES.find((m) => m.days > summary.currentStreak) ?? null;

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
        <div className="creator-chip">
          {viewer.profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="av" src={viewer.profile.avatarUrl} alt="" width={26} height={26} />
          ) : (
            <div className="av" aria-hidden />
          )}
          <b>{viewer.profile.displayName}</b>
        </div>
      </header>

      {viewer.demo && (
        <div className="notice info">
          Demo mode. Everything below is generated sample data — no Fanvue account is connected.
        </div>
      )}

      {warnings.length > 0 && (
        <div className="notice">
          Some panels are limited:
          <ul>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <Insights insights={insights} />

      <div className="grid">
        <StreakHero
          currentStreak={summary.currentStreak}
          message={summary.message}
          atRisk={summary.atRisk}
          nextMilestone={nextMilestone}
          freezes={summary.freezes}
        />

        <div className="card full rise">
          <h2>Posting activity (last {env.HISTORY_DAYS} days, {state.timezone})</h2>
          <Heatmap weeks={summary.weeks} />
          {postsFound === 0 && warnings.length === 0 && (
            <p className="muted-line" style={{ marginTop: 12 }}>
              Fanvue has no posts on this account in the last {env.HISTORY_DAYS} days. Post once and
              your streak starts here.
            </p>
          )}
        </div>

        <div className="card rise">
          <h2>Personal bests</h2>
          <div className="best-row">
            <span>Longest streak</span>
            <b>{bests.longestStreak} days</b>
          </div>
          <div className="best-row">
            <span>Most posts in a week</span>
            <b>{bests.mostPostsInWeek} posts</b>
          </div>
          <div className="best-row">
            <span>Biggest earning day</span>
            <b>{bests.bestEarningsDay ? money(bests.bestEarningsDay.amount) : "—"}</b>
          </div>
          <div className="best-row">
            <span>Freezes used this month</span>
            <b>
              {bests.freezesUsedThisMonth} / {bests.freezeAllowance}
            </b>
          </div>
        </div>

        <div className="card rise">
          <h2>Milestone badges</h2>
          <Badges
            badges={summary.badges}
            streak={Math.max(summary.currentStreak, summary.longestStreak)}
            creatorName={viewer.profile.displayName}
          />
        </div>

        <div className="card full rise">
          <h2>Consistency vs earnings</h2>
          {earningsAvailable ? (
            <>
              <ConsistencyChart weeks={summary.weekly} />
              {correlation ? (
                <div className="insight">
                  {correlation.overlapOfTopThree > 0 && (
                    <>
                      <b>{correlation.overlapOfTopThree}</b> of your three best-earning weeks{" "}
                      {correlation.overlapOfTopThree === 1 ? "was" : "were"} also among your three
                      most active posting weeks.{" "}
                    </>
                  )}
                  On weeks where you posted 5 or more times, average earnings were{" "}
                  <b>
                    {correlation.upliftPct >= 0
                      ? `${correlation.upliftPct}% higher`
                      : `${Math.abs(correlation.upliftPct)}% lower`}
                  </b>{" "}
                  than weeks with 2 or fewer posts ({money(correlation.highPostAvg)} vs{" "}
                  {money(correlation.lowPostAvg)} per week).
                </div>
              ) : (
                <div className="insight">
                  Not enough contrast between your busy and quiet weeks yet to compare them fairly.
                </div>
              )}
            </>
          ) : (
            <p className="muted-line">
              Earnings insights are not connected. Reconnect and grant the insights scope to see how
              consistency tracks with income.
            </p>
          )}
        </div>

        <div className="stack">
        <div className="card rise">
          <h2>Comeback tracker</h2>
          {comeback.breaks === 0 ? (
            <p className="muted-line">
              No breaks to come back from yet. Once you have missed a day and returned, this shows
              how quickly you got going again.
            </p>
          ) : comeback.breaks === 1 ? (
            <>
              <div className="comeback-stat">
                <span className="n">
                  {comeback.longestBreak} day{comeback.longestBreak === 1 ? "" : "s"}
                </span>
                <span className="muted-line">off before you posted again</span>
              </div>
              <div className="muted-line">
                One break so far. Come back from a few more and this becomes an average worth
                watching.
              </div>
            </>
          ) : (
            <>
              <div className="comeback-stat">
                <span className="n">
                  {comeback.averageDaysToReturn} day{comeback.averageDaysToReturn === 1 ? "" : "s"}
                </span>
                <span className="muted-line">average time back to posting after a break</span>
              </div>
              <div className="muted-line">
                You have bounced back within a day <b>{comeback.sameDayOrNextDay}</b> of{" "}
                <b>{comeback.breaks}</b> times. That is what keeps a streak alive — not never
                missing, but never quitting.
              </div>
            </>
          )}
        </div>
        <AccountCard demo={viewer.demo} />
        </div>

        <NudgeCard initial={state.nudge} timezone={state.timezone} reminders={reminders} />

      </div>

      <Footer />
    </div>
  );
}

export const dynamic = "force-dynamic";
