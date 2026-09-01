import type { ActivitySource, ActivityWindow, DailyActivity, Profile } from "./types";
import { addDays, dayOfWeek, daysBetween, eachDay, toLocalDate } from "@/lib/streak/dates";

/**
 * Deterministic sample data for DEMO_MODE, so the app can be reviewed, demoed
 * and screenshotted without anyone connecting a real Fanvue account. It never
 * calls the Fanvue API and holds no credentials.
 *
 * The shape is deliberately story-like: a strong run, a three day break, a fast
 * comeback, and a live streak, so every panel has something to show.
 */
const DEMO_PROFILE: Profile = {
  id: "demo-creator",
  displayName: "Demo Creator",
  handle: "demo",
  avatarUrl: null,
  timezone: "Europe/London",
};

function mulberry32(seed: number) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class DemoSource implements ActivitySource {
  async getProfile(): Promise<Profile> {
    return DEMO_PROFILE;
  }

  async getActivity(historyDays: number, timezone: string): Promise<ActivityWindow> {
    const today = toLocalDate(new Date(), timezone);
    const start = addDays(today, -(historyDays - 1));
    const dates = eachDay(start, today);
    const rand = mulberry32(20260831);
    // Quiet weeks must line up with the Sunday-aligned weeks the engine
    // aggregates on, otherwise a quiet stretch is split across two weeks and
    // neither reads as quiet.
    const anchorSunday = addDays(dates[0], -dayOfWeek(dates[0]));

    const days: DailyActivity[] = dates.map((date, index) => {
      const fromEnd = dates.length - 1 - index;

      // A three day break, 40-ish days ago, to drive the comeback panel.
      const inBreak = fromEnd >= 40 && fromEnd <= 42;
      // A live 23 day streak running up to today.
      const inCurrentStreak = fromEnd < 23;

      // Older history alternates busy and quiet weeks. Without genuinely quiet
      // weeks the consistency panel has nothing to compare against.
      const weekIndex = Math.floor(daysBetween(anchorSunday, date) / 7);
      const quietWeek = weekIndex % 3 === 1;

      let posts: number;
      if (inBreak) {
        posts = 0;
      } else if (inCurrentStreak) {
        posts = 1 + Math.floor(rand() * 3);
      } else if (quietWeek) {
        posts = rand() < 0.78 ? 0 : 1;
      } else {
        const weekend = [0, 6].includes(dayOfWeek(date));
        const r = rand();
        posts = r < (weekend ? 0.4 : 0.15) ? 0 : 1 + Math.floor(rand() * 3);
      }

      // Earnings track posting with noise, which is the relationship the
      // consistency panel is there to surface.
      const earnings = Math.round(40 + posts * 95 + rand() * 70);
      return { date, posts, earnings };
    });

    return { days, earningsAvailable: true, currency: "USD", warnings: [] };
  }
}
