import type { DailyActivity } from "@/lib/fanvue/types";
import type { StreakSummary } from "./engine";
import { MILESTONES } from "./engine";
import { dayOfWeek, localHour, WEEKDAY_NAMES } from "./dates";

/**
 * Insights are ranked observations a creator can act on today. Every one is
 * guarded by a sample-size check, states what was measured rather than why,
 * and points at a single next step. The engine stays pure: it takes `now` as
 * an argument so the output is reproducible in tests.
 */
export type InsightTone = "urgent" | "positive" | "neutral" | "locked";

export type Insight = {
  id: string;
  tone: InsightTone;
  title: string;
  body: string;
  /** Large figure shown beside the text, when there is one worth showing. */
  metric?: string;
  /** What the creator can do about it, if anything. */
  action?: { label: string; kind: "post" | "freeze" | "remind" };
};

export type InsightInput = {
  summary: StreakSummary;
  days: DailyActivity[];
  postingHours: number[];
  postsFound: number;
  earningsAvailable: boolean;
  currency: string;
  timezone: string;
  /** Whether the deployment can actually deliver a reminder right now. */
  remindersLive: boolean;
  now: Date;
};

/** How many posts unlock the analytical insights. */
export const INSIGHTS_UNLOCK_AT = 5;

const RANK: Record<string, number> = {
  "streak-at-risk": 0,
  "freeze-available": 1,
  "consistency-target": 2,
  "milestone-close": 3,
  "best-days": 4,
  momentum: 5,
  "comeback-strength": 6,
  "posting-hour": 7,
};

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${Math.round(amount)} ${currency}`;
  }
}

function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** The hour a creator most often posts, or null with too little data. */
export function peakPostingHour(postingHours: number[]): number | null {
  const total = postingHours.reduce((a, b) => a + b, 0);
  if (total < 8) return null;
  // Smooth over a three hour window so one busy hour does not dominate.
  let best = 0;
  let bestScore = -1;
  for (let h = 0; h < 24; h++) {
    const score = postingHours[(h + 23) % 24] + postingHours[h] * 2 + postingHours[(h + 1) % 24];
    if (score > bestScore) {
      bestScore = score;
      best = h;
    }
  }
  return best;
}

export function deriveInsights(input: InsightInput): Insight[] {
  const {
    summary,
    days,
    postingHours,
    postsFound,
    earningsAvailable,
    currency,
    timezone,
    remindersLive,
    now,
  } = input;
  const out: Insight[] = [];

  // --- not enough history yet: one honest card instead of empty guesses ----
  if (postsFound < INSIGHTS_UNLOCK_AT) {
    const remaining = INSIGHTS_UNLOCK_AT - postsFound;
    return [
      {
        id: "locked",
        tone: "locked",
        title: "Insights unlock with a little history",
        body:
          postsFound === 0
            ? `Post ${INSIGHTS_UNLOCK_AT} times and Streak starts spotting your patterns: best days, natural posting hour, and what your steadier weeks earn.`
            : `${remaining} more post${remaining === 1 ? "" : "s"} and Streak starts spotting your patterns.`,
        metric: `${postsFound}/${INSIGHTS_UNLOCK_AT}`,
      },
    ];
  }

  // --- streak at risk ---------------------------------------------------
  if (summary.atRisk && summary.currentStreak > 0) {
    const hoursLeft = 24 - localHour(now, timezone);
    out.push({
      id: "streak-at-risk",
      tone: "urgent",
      title: `Your ${summary.currentStreak}-day streak ends at midnight`,
      body: `Nothing posted yet today. About ${hoursLeft} hour${hoursLeft === 1 ? "" : "s"} left in your day (${timezone}). One post keeps it alive.`,
      metric: `${hoursLeft}h`,
      action: { label: "Post now", kind: "post" },
    });
  }

  // --- a freeze that would actually save the run --------------------------
  const { coverDates, gapLength, available } = summary.freezes;
  if (coverDates.length > 0) {
    out.push({
      id: "freeze-available",
      tone: "urgent",
      title: gapLength === 1 ? "You missed yesterday" : `You missed the last ${gapLength} days`,
      body: `Cover ${gapLength === 1 ? "it" : "them"} with ${gapLength} of your ${available} remaining freeze${available === 1 ? "" : "s"} and the streak carries on as if you never stopped.`,
      metric: `${gapLength}❄`,
      action: { label: gapLength === 1 ? "Cover yesterday" : `Cover ${gapLength} days`, kind: "freeze" },
    });
  }

  // --- posts this week vs the pattern that earns --------------------------
  const thisWeek = summary.weekly[summary.weekly.length - 1];
  if (summary.correlation && thisWeek && summary.correlation.upliftPct >= 15) {
    const target = 5;
    const remaining = target - thisWeek.posts;
    if (remaining > 0 && remaining <= 4) {
      out.push({
        id: "consistency-target",
        tone: "neutral",
        title: `${remaining} more post${remaining === 1 ? "" : "s"} this week hits your best pattern`,
        body: `Weeks where you posted ${target}+ times earned ${summary.correlation.upliftPct}% more than your quietest weeks (${money(summary.correlation.highPostAvg, currency)} vs ${money(summary.correlation.lowPostAvg, currency)}). You are at ${thisWeek.posts} so far.`,
        metric: `${thisWeek.posts}/${target}`,
        action: { label: "Post now", kind: "post" },
      });
    }
  }

  // --- a milestone within reach -------------------------------------------
  if (summary.currentStreak > 0) {
    const next = MILESTONES.find((m) => m.days > summary.longestStreak);
    if (next) {
      const daysToGo = next.days - summary.currentStreak;
      if (daysToGo > 0 && daysToGo <= 7) {
        out.push({
          id: "milestone-close",
          tone: "positive",
          title: `${daysToGo} day${daysToGo === 1 ? "" : "s"} to your ${next.label} badge`,
          body: `Keep posting for ${daysToGo} more day${daysToGo === 1 ? "" : "s"} and it is yours. Your longest run so far is ${summary.longestStreak} days.`,
          metric: `${next.icon}`,
        });
      }
    }
  }

  // --- best-earning weekdays ------------------------------------------------
  if (earningsAvailable) {
    const withEarnings = days.filter((d) => typeof d.earnings === "number");
    if (withEarnings.length >= 42) {
      const byWeekday: number[][] = Array.from({ length: 7 }, () => []);
      for (const d of withEarnings) byWeekday[dayOfWeek(d.date)].push(d.earnings as number);
      const typical = mean(withEarnings.map((d) => d.earnings as number));
      if (typical > 0) {
        const ranked = byWeekday
          .map((xs, i) => ({ day: i, avg: mean(xs), n: xs.length }))
          .filter((r) => r.n >= 6)
          .sort((a, b) => b.avg - a.avg);
        const strong = ranked.filter((r) => r.avg >= typical * 1.3).slice(0, 2);
        if (strong.length) {
          const names = strong.map((r) => `${WEEKDAY_NAMES[r.day]}s`).join(" and ");
          const uplift = Math.round(((strong[0].avg - typical) / typical) * 100);
          out.push({
            id: "best-days",
            tone: "positive",
            title: `${names} are your best-earning days`,
            body: `Your average ${WEEKDAY_NAMES[strong[0].day]} brings in ${money(strong[0].avg, currency)}, ${uplift}% above a typical day. Worth making sure those days always get a post.`,
            metric: `+${uplift}%`,
          });
        }
      }
    }
  }

  // --- momentum: last four full weeks vs the four before ------------------
  const full = summary.weekly.slice(0, -1);
  if (full.length >= 8) {
    const recent = mean(full.slice(-4).map((w) => w.posts));
    const before = mean(full.slice(-8, -4).map((w) => w.posts));
    if (before > 0) {
      const change = Math.round(((recent - before) / before) * 100);
      if (change >= 15) {
        out.push({
          id: "momentum",
          tone: "positive",
          title: "You are posting more than last month",
          body: `${recent.toFixed(1)} posts a week over the last four weeks, up from ${before.toFixed(1)}. Momentum like this is what long streaks are made of.`,
          metric: `+${change}%`,
        });
      } else if (change <= -15) {
        out.push({
          id: "momentum",
          tone: "neutral",
          title: "Posting has slowed this month",
          body: `${recent.toFixed(1)} posts a week over the last four weeks, down from ${before.toFixed(1)}. Not a verdict, just worth knowing before the habit slips further.`,
          metric: `${change}%`,
          action: { label: "Post now", kind: "post" },
        });
      }
    }
  }

  // --- comebacks ------------------------------------------------------------
  const cb = summary.comeback;
  if (cb.breaks >= 3 && cb.sameDayOrNextDay / cb.breaks >= 0.6) {
    out.push({
      id: "comeback-strength",
      tone: "positive",
      title: "You bounce back fast",
      body: `${cb.sameDayOrNextDay} of your ${cb.breaks} breaks lasted a day or less. Missing a day is not the habit; not coming back is. You come back.`,
      metric: `${Math.round((cb.sameDayOrNextDay / cb.breaks) * 100)}%`,
    });
  }

  // --- natural posting hour ---------------------------------------------------
  const peak = peakPostingHour(postingHours);
  if (peak !== null && !summary.atRisk) {
    out.push({
      id: "posting-hour",
      tone: "neutral",
      title: `You usually post around ${String(peak).padStart(2, "0")}:00`,
      body: remindersLive
        ? "A reminder a little before that catches you at the moment you already tend to post, rather than interrupting your day."
        : "Knowing your natural hour makes it easier to protect. Block it out, and the streak looks after itself.",
      metric: `${String(peak).padStart(2, "0")}:00`,
      ...(remindersLive ? { action: { label: "Set a reminder", kind: "remind" as const } } : {}),
    });
  }

  return out.sort((a, b) => (RANK[a.id] ?? 99) - (RANK[b.id] ?? 99)).slice(0, 4);
}
