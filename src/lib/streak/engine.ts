import type { DailyActivity } from "@/lib/fanvue/types";
import { MAX_FREEZES_PER_MONTH } from "@/lib/store/types";
import { addDays, dayOfWeek, daysBetween, monthOf, WEEKDAY_NAMES } from "./dates";

export const MILESTONES = [
  { days: 7, icon: "\u{1F949}", label: "7 days" },
  { days: 30, icon: "\u{1F948}", label: "30 days" },
  { days: 100, icon: "\u{1F947}", label: "100 days" },
  { days: 365, icon: "\u{1F3C6}", label: "365 days" },
] as const;

export type HeatCell = {
  date: string;
  posts: number;
  frozen: boolean;
  /** 0 = nothing, 1-3 = intensity, matching the four-step colour scale. */
  level: 0 | 1 | 2 | 3;
  /** Days after `today`, rendered as placeholders. */
  future: boolean;
};

export type EngineInput = {
  /** Ascending, one entry per calendar day, no gaps. */
  days: DailyActivity[];
  frozenDates: string[];
  today: string;
  /** Milestones already earned in the past, so a badge never un-earns itself. */
  unlockedBadges: number[];
  /** Longest streak recorded before this window, so history is not lost. */
  longestStreakEver?: number;
};

export type StreakSummary = ReturnType<typeof analyse>;

function levelFor(posts: number): 0 | 1 | 2 | 3 {
  if (posts <= 0) return 0;
  if (posts === 1) return 1;
  if (posts === 2) return 2;
  return 3;
}

export function analyse(input: EngineInput) {
  const { today, frozenDates, unlockedBadges } = input;
  const longestStreakEver = input.longestStreakEver ?? 0;
  const frozen = new Set(frozenDates);
  const byDate = new Map(input.days.map((d) => [d.date, d]));

  const postsOn = (date: string) => byDate.get(date)?.posts ?? 0;
  const isActive = (date: string) => postsOn(date) > 0 || frozen.has(date);

  // --- current streak ---------------------------------------------------
  // A streak survives a day that has not finished yet: if nothing is posted
  // today the streak still stands as long as yesterday was active, and today
  // is reported as at risk instead of breaking it.
  const todayActive = isActive(today);
  let anchor: string | null = null;
  if (todayActive) anchor = today;
  else if (isActive(addDays(today, -1))) anchor = addDays(today, -1);

  let currentStreak = 0;
  let streakHasRealPost = false;
  if (anchor) {
    for (let d = anchor; isActive(d); d = addDays(d, -1)) {
      currentStreak++;
      if (postsOn(d) > 0) streakHasRealPost = true;
      // Stop at the edge of the fetched window rather than counting phantom days.
      if (!byDate.has(addDays(d, -1))) break;
    }
  }
  // A freeze protects a streak; it cannot manufacture one. Without a single real
  // post behind it, a run of frozen days is not a streak and must not be shown
  // as though the creator had posted.
  if (!streakHasRealPost) currentStreak = 0;
  const atRisk = !todayActive && currentStreak > 0;

  // --- longest streak in the window -------------------------------------
  let longestInWindow = 0;
  let run = 0;
  for (const day of input.days) {
    if (daysBetween(day.date, today) < 0) break; // ignore future padding
    if (isActive(day.date)) {
      run++;
      longestInWindow = Math.max(longestInWindow, run);
    } else {
      run = 0;
    }
  }
  const longestStreak = Math.max(longestInWindow, longestStreakEver, currentStreak);

  // --- heatmap, Sunday-aligned columns ----------------------------------
  const first = input.days[0]?.date ?? today;
  const gridStart = addDays(first, -dayOfWeek(first));
  const lastDay = input.days[input.days.length - 1]?.date ?? today;
  const gridEnd = addDays(lastDay, 6 - dayOfWeek(lastDay));

  const weeks: HeatCell[][] = [];
  for (let weekStart = gridStart; daysBetween(weekStart, gridEnd) >= 0; weekStart = addDays(weekStart, 7)) {
    const week: HeatCell[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(weekStart, i);
      const posts = postsOn(date);
      week.push({
        date,
        posts,
        frozen: frozen.has(date),
        level: levelFor(posts),
        future: daysBetween(today, date) > 0,
      });
    }
    weeks.push(week);
  }

  // --- weekly aggregates -------------------------------------------------
  const weekly = weeks
    .map((week) => {
      const real = week.filter((c) => !c.future && byDate.has(c.date));
      if (real.length === 0) return null;
      const earningsValues = real
        .map((c) => byDate.get(c.date)?.earnings)
        .filter((v): v is number => typeof v === "number");
      return {
        weekStart: week[0].date,
        posts: real.reduce((sum, c) => sum + c.posts, 0),
        activeDays: real.filter((c) => c.posts > 0 || c.frozen).length,
        earnings: earningsValues.length ? earningsValues.reduce((a, b) => a + b, 0) : null,
      };
    })
    .filter((w): w is NonNullable<typeof w> => w !== null);

  // --- consistency vs earnings ------------------------------------------
  const earningWeeks = weekly.filter((w) => w.earnings !== null) as (typeof weekly[number] & {
    earnings: number;
  })[];

  let correlation: {
    highPostAvg: number;
    lowPostAvg: number;
    upliftPct: number;
    overlapOfTopThree: number;
  } | null = null;

  if (earningWeeks.length >= 4) {
    const high = earningWeeks.filter((w) => w.posts >= 5);
    const low = earningWeeks.filter((w) => w.posts <= 2);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    if (high.length && low.length) {
      const highPostAvg = mean(high.map((w) => w.earnings));
      const lowPostAvg = mean(low.map((w) => w.earnings));
      const topEarning = [...earningWeeks].sort((a, b) => b.earnings - a.earnings).slice(0, 3);
      const topPosting = [...earningWeeks].sort((a, b) => b.posts - a.posts).slice(0, 3);
      const topPostingStarts = new Set(topPosting.map((w) => w.weekStart));
      correlation = {
        highPostAvg,
        lowPostAvg,
        upliftPct: lowPostAvg > 0 ? Math.round(((highPostAvg - lowPostAvg) / lowPostAvg) * 100) : 0,
        overlapOfTopThree: topEarning.filter((w) => topPostingStarts.has(w.weekStart)).length,
      };
    }
  }

  // --- comeback tracker --------------------------------------------------
  // A "break" is a run of inactive days that the creator came back from. Runs
  // still open at the end of the window are not comebacks yet, so they do not
  // count towards the average.
  const past = input.days.filter((d) => daysBetween(d.date, today) >= 0);
  const gaps: number[] = [];
  let gap = 0;
  let seenActive = false;
  for (const day of past) {
    if (isActive(day.date)) {
      if (gap > 0 && seenActive) gaps.push(gap);
      gap = 0;
      seenActive = true;
    } else if (seenActive) {
      gap++;
    }
  }
  const comeback = {
    breaks: gaps.length,
    averageDaysToReturn: gaps.length
      ? Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 10) / 10
      : null,
    sameDayOrNextDay: gaps.filter((g) => g <= 1).length,
  };

  // --- posting cadence --------------------------------------------------
  const byWeekday = Array.from({ length: 7 }, () => 0);
  for (const day of past) byWeekday[dayOfWeek(day.date)] += day.posts;
  const topDays = byWeekday
    .map((count, index) => ({ count, index }))
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 2)
    .map((d) => d.index)
    .sort((a, b) => a - b);

  // --- freezes ----------------------------------------------------------
  const thisMonth = monthOf(today);
  const usedThisMonth = frozenDates.filter((d) => monthOf(d) === thisMonth).length;
  /**
   * A freeze covers the day that would otherwise break an existing run, so a day
   * is only offered when the day before it is already active. That keeps a
   * freeze doing the one job it has - protecting a streak - and stops it
   * inventing one out of an empty account. Longer gaps are still coverable:
   * freezing the earliest day makes the next one eligible in turn.
   */
  const eligibleDates: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = addDays(today, -i);
    if (!byDate.has(date)) continue;
    if (postsOn(date) > 0 || frozen.has(date)) continue;
    if (!isActive(addDays(date, -1))) continue;
    eligibleDates.push(date);
  }

  // --- bests ------------------------------------------------------------
  const bestEarningsDay = past
    .filter((d) => typeof d.earnings === "number")
    .sort((a, b) => (b.earnings ?? 0) - (a.earnings ?? 0))[0];

  const bests = {
    longestStreak,
    mostPostsInWeek: weekly.reduce((max, w) => Math.max(max, w.posts), 0),
    bestEarningsDay: bestEarningsDay?.earnings
      ? { date: bestEarningsDay.date, amount: bestEarningsDay.earnings }
      : null,
    freezesUsedThisMonth: usedThisMonth,
    freezeAllowance: MAX_FREEZES_PER_MONTH,
  };

  // --- badges -----------------------------------------------------------
  const badges = MILESTONES.map((m) => ({
    ...m,
    unlocked: longestStreak >= m.days,
    newlyUnlocked: longestStreak >= m.days && !unlockedBadges.includes(m.days),
  }));

  return {
    currentStreak,
    longestStreak,
    atRisk,
    todayActive,
    postsToday: postsOn(today),
    message: buildMessage({ currentStreak, longestInWindow, atRisk, todayActive }),
    weeks,
    weekly,
    correlation,
    comeback,
    cadence: { topDays, topDayNames: topDays.map((d) => WEEKDAY_NAMES[d]) },
    freezes: {
      used: usedThisMonth,
      available: Math.max(0, MAX_FREEZES_PER_MONTH - usedThisMonth),
      allowance: MAX_FREEZES_PER_MONTH,
      eligibleDates,
    },
    bests,
    badges,
  };
}

function buildMessage({
  currentStreak,
  longestInWindow,
  atRisk,
  todayActive,
}: {
  currentStreak: number;
  longestInWindow: number;
  atRisk: boolean;
  todayActive: boolean;
}): string {
  if (currentStreak === 0) return "No active streak. One post today starts a new one.";
  if (atRisk) return "Nothing posted today yet. Post or use a freeze to keep the streak alive.";
  if (currentStreak >= longestInWindow && currentStreak > 1) {
    return "This is your longest streak in the window. Keep going!";
  }
  if (todayActive && currentStreak === 1) return "Day one. Come back tomorrow to make it two.";
  return `${currentStreak} days and counting.`;
}
