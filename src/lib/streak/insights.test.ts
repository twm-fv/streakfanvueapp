import { describe, expect, it } from "vitest";
import { analyse } from "./engine";
import { addDays, eachDay } from "./dates";
import { deriveInsights, peakPostingHour, INSIGHTS_UNLOCK_AT } from "./insights";
import type { DailyActivity } from "@/lib/fanvue/types";

const TODAY = "2026-03-15"; // a Sunday
const NOON = new Date("2026-03-15T12:00:00Z");

function window(today: string, length: number, posts: Record<string, number>, earn?: (d: string) => number | null): DailyActivity[] {
  const start = addDays(today, -(length - 1));
  return eachDay(start, today).map((date) => ({
    date,
    posts: posts[date] ?? 0,
    earnings: earn ? earn(date) : null,
  }));
}

function run(days: DailyActivity[], extra: Partial<Parameters<typeof deriveInsights>[0]> = {}) {
  const summary = analyse({ days, frozenDates: [], today: TODAY, unlockedBadges: [], ...(extra as object) });
  const postsFound = days.reduce((n, d) => n + d.posts, 0);
  return deriveInsights({
    summary,
    days,
    postingHours: Array(24).fill(0),
    postsFound,
    earningsAvailable: days.some((d) => d.earnings !== null),
    currency: "USD",
    timezone: "UTC",
    now: NOON,
    ...extra,
  });
}

describe("insights", () => {
  it("shows a single locked card until there is enough history", () => {
    const out = run(window(TODAY, 30, { "2026-03-15": 1, "2026-03-14": 1 }));
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("locked");
    expect(out[0].metric).toBe(`2/${INSIGHTS_UNLOCK_AT}`);
  });

  it("puts a streak at risk first, with hours left in the creator's day", () => {
    const posts: Record<string, number> = {};
    for (let i = 1; i <= 10; i++) posts[addDays(TODAY, -i)] = 1; // streak up to yesterday
    const out = run(window(TODAY, 30, posts));
    expect(out[0].id).toBe("streak-at-risk");
    expect(out[0].tone).toBe("urgent");
    expect(out[0].metric).toBe("12h"); // noon UTC, 12 hours to midnight
  });

  it("offers the freeze when it would save the run", () => {
    const posts: Record<string, number> = {};
    for (let i = 2; i <= 12; i++) posts[addDays(TODAY, -i)] = 1; // missed yesterday and today
    const out = run(window(TODAY, 30, posts));
    const freeze = out.find((i) => i.id === "freeze-available");
    expect(freeze).toBeDefined();
    expect(freeze!.action?.kind).toBe("freeze");
  });

  it("spots best-earning weekdays with enough samples", () => {
    // Saturdays earn triple. dayOfWeek(2026-03-14) is Saturday.
    const days = window(TODAY, 84, Object.fromEntries(eachDay(addDays(TODAY, -83), TODAY).map((d) => [d, 1])), (d) => {
      const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
      return dow === 6 ? 300 : 100;
    });
    const out = run(days);
    const best = out.find((i) => i.id === "best-days");
    expect(best).toBeDefined();
    expect(best!.title).toContain("Saturdays");
  });

  it("caps output at four and keeps urgent items ahead", () => {
    const posts: Record<string, number> = {};
    for (let i = 1; i <= 27; i++) posts[addDays(TODAY, -i)] = 1; // 27-day streak, at risk, 3 to badge
    const hours = Array(24).fill(0);
    hours[21] = 30;
    const out = run(window(TODAY, 90, posts), { postingHours: hours });
    expect(out.length).toBeLessThanOrEqual(4);
    expect(out[0].tone).toBe("urgent");
    expect(out.some((i) => i.id === "milestone-close")).toBe(true);
  });
});

describe("peakPostingHour", () => {
  it("needs a minimum sample", () => {
    const h = Array(24).fill(0);
    h[20] = 3;
    expect(peakPostingHour(h)).toBeNull();
  });

  it("smooths to the centre of a busy evening", () => {
    const h = Array(24).fill(0);
    h[20] = 6;
    h[21] = 9;
    h[22] = 5;
    expect(peakPostingHour(h)).toBe(21);
  });
});
