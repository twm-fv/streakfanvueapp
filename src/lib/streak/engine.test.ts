import { describe, expect, it } from "vitest";
import { analyse } from "./engine";
import { addDays, eachDay } from "./dates";
import type { DailyActivity } from "@/lib/fanvue/types";

/** Builds a contiguous window ending on `today`, with posts on the named dates. */
function window(today: string, length: number, posts: Record<string, number>): DailyActivity[] {
  const start = addDays(today, -(length - 1));
  return eachDay(start, today).map((date) => ({
    date,
    posts: posts[date] ?? 0,
    earnings: null,
  }));
}

const TODAY = "2026-03-15";

describe("current streak", () => {
  it("counts consecutive active days ending today", () => {
    const days = window(TODAY, 30, {
      "2026-03-13": 1,
      "2026-03-14": 2,
      "2026-03-15": 1,
    });
    const r = analyse({ days, frozenDates: [], today: TODAY, unlockedBadges: [] });
    expect(r.currentStreak).toBe(3);
    expect(r.atRisk).toBe(false);
  });

  it("survives an unfinished today and reports it as at risk", () => {
    const days = window(TODAY, 30, { "2026-03-13": 1, "2026-03-14": 1 });
    const r = analyse({ days, frozenDates: [], today: TODAY, unlockedBadges: [] });
    expect(r.currentStreak).toBe(2);
    expect(r.atRisk).toBe(true);
  });

  it("is zero once two days are missed", () => {
    const days = window(TODAY, 30, { "2026-03-12": 1 });
    const r = analyse({ days, frozenDates: [], today: TODAY, unlockedBadges: [] });
    expect(r.currentStreak).toBe(0);
    expect(r.atRisk).toBe(false);
  });

  it("bridges a gap that has been frozen", () => {
    const days = window(TODAY, 30, {
      "2026-03-12": 1,
      "2026-03-13": 1,
      "2026-03-15": 1,
    });
    const withoutFreeze = analyse({ days, frozenDates: [], today: TODAY, unlockedBadges: [] });
    expect(withoutFreeze.currentStreak).toBe(1);

    const withFreeze = analyse({
      days,
      frozenDates: ["2026-03-14"],
      today: TODAY,
      unlockedBadges: [],
    });
    expect(withFreeze.currentStreak).toBe(4);
  });

  it("does not count past the edge of the fetched window", () => {
    const days = window(TODAY, 5, {
      "2026-03-11": 1,
      "2026-03-12": 1,
      "2026-03-13": 1,
      "2026-03-14": 1,
      "2026-03-15": 1,
    });
    const r = analyse({ days, frozenDates: [], today: TODAY, unlockedBadges: [] });
    expect(r.currentStreak).toBe(5);
  });
});

describe("longest streak", () => {
  it("never regresses below a previously recorded record", () => {
    const days = window(TODAY, 30, { "2026-03-15": 1 });
    const r = analyse({
      days,
      frozenDates: [],
      today: TODAY,
      unlockedBadges: [30],
      longestStreakEver: 41,
    });
    expect(r.longestStreak).toBe(41);
    expect(r.badges.find((b) => b.days === 30)?.unlocked).toBe(true);
    expect(r.badges.find((b) => b.days === 30)?.newlyUnlocked).toBe(false);
  });

  it("reports the true record rather than the badge threshold", () => {
    const days = window(TODAY, 30, { "2026-03-15": 1 });
    const r = analyse({
      days,
      frozenDates: [],
      today: TODAY,
      unlockedBadges: [7, 30],
      longestStreakEver: 47,
    });
    // Badge-derived logic would have said 30 here, understating the record.
    expect(r.longestStreak).toBe(47);
  });

  it("flags a milestone crossed for the first time", () => {
    const posts: Record<string, number> = {};
    for (const date of eachDay(addDays(TODAY, -6), TODAY)) posts[date] = 1;
    const r = analyse({ days: window(TODAY, 30, posts), frozenDates: [], today: TODAY, unlockedBadges: [] });
    expect(r.currentStreak).toBe(7);
    expect(r.badges.find((b) => b.days === 7)?.newlyUnlocked).toBe(true);
    expect(r.badges.find((b) => b.days === 30)?.unlocked).toBe(false);
  });
});

describe("freezes", () => {
  it("counts only the current calendar month against the allowance", () => {
    const days = window(TODAY, 60, { "2026-03-15": 1 });
    const r = analyse({
      days,
      frozenDates: ["2026-02-10", "2026-02-11", "2026-03-02"],
      today: TODAY,
      unlockedBadges: [],
    });
    expect(r.freezes.used).toBe(1);
    expect(r.freezes.available).toBe(2);
  });

  it("offers the whole gap between the last post and today", () => {
    // Posted on the 12th, then missed the 13th and 14th; nothing today either.
    const days = window(TODAY, 30, { "2026-03-12": 1 });
    const r = analyse({ days, frozenDates: [], today: TODAY, unlockedBadges: [] });
    expect(r.freezes.gapLength).toBe(3);
    expect(r.freezes.coverDates).toEqual(["2026-03-15", "2026-03-14", "2026-03-13"]);
  });

  it("offers nothing when the gap costs more freezes than are left", () => {
    const days = window(TODAY, 30, { "2026-03-12": 1 });
    const r = analyse({
      days,
      // Two already spent this month leaves one, but the gap needs three.
      frozenDates: ["2026-03-05", "2026-03-06"],
      today: TODAY,
      unlockedBadges: [],
    });
    expect(r.freezes.gapLength).toBe(3);
    expect(r.freezes.available).toBe(1);
    expect(r.freezes.coverDates).toEqual([]);
  });

  it("offers nothing while the streak is intact", () => {
    const days = window(TODAY, 30, { "2026-03-14": 1, "2026-03-15": 1 });
    const r = analyse({ days, frozenDates: [], today: TODAY, unlockedBadges: [] });
    expect(r.freezes.gapLength).toBe(0);
    expect(r.freezes.coverDates).toEqual([]);
  });

  it("offers nothing on an account that has never posted", () => {
    const days = window(TODAY, 30, {});
    const r = analyse({ days, frozenDates: [], today: TODAY, unlockedBadges: [] });
    expect(r.freezes.gapLength).toBe(0);
    expect(r.freezes.coverDates).toEqual([]);
  });

  it("does not treat an earlier freeze as something to build on", () => {
    // A freeze was spent, but nothing was ever posted, so there is no streak
    // for another freeze to protect.
    const days = window(TODAY, 30, {});
    const r = analyse({
      days,
      frozenDates: ["2026-03-13"],
      today: TODAY,
      unlockedBadges: [],
    });
    expect(r.freezes.coverDates).toEqual([]);
    expect(r.currentStreak).toBe(0);
  });

  it("never lets a freeze manufacture a streak from nothing", () => {
    const days = window(TODAY, 30, {});
    const r = analyse({
      days,
      frozenDates: [TODAY, "2026-03-14"],
      today: TODAY,
      unlockedBadges: [],
    });
    expect(r.currentStreak).toBe(0);
    expect(r.message).toContain("No active streak");
  });
});

describe("comeback tracker", () => {
  it("counts no breaks on an account that has only ever used freezes", () => {
    const days = window(TODAY, 20, {});
    const r = analyse({
      days,
      frozenDates: ["2026-03-05", "2026-03-08"],
      today: TODAY,
      unlockedBadges: [],
    });
    // A freeze is not a return to posting, so it invents neither a break nor a
    // comeback.
    expect(r.comeback.breaks).toBe(0);
    expect(r.comeback.averageDaysToReturn).toBeNull();
  });

  it("averages closed gaps only and ignores an open one", () => {
    const days = window(TODAY, 20, {
      "2026-02-28": 1,
      "2026-03-02": 1, // 1 day gap, closed
      "2026-03-06": 1, // 3 day gap, closed
      // trailing gap after 2026-03-06 stays open
    });
    const r = analyse({ days, frozenDates: [], today: TODAY, unlockedBadges: [] });
    expect(r.comeback.breaks).toBe(2);
    expect(r.comeback.averageDaysToReturn).toBe(2);
    expect(r.comeback.sameDayOrNextDay).toBe(1);
  });
});

describe("heatmap", () => {
  it("emits Sunday-aligned full weeks and marks future days", () => {
    const days = window(TODAY, 14, { "2026-03-15": 2 });
    const r = analyse({ days, frozenDates: [], today: TODAY, unlockedBadges: [] });
    expect(r.weeks.every((w) => w.length === 7)).toBe(true);
    // 2026-03-15 is a Sunday, so it opens the final week and the rest is future.
    const finalWeek = r.weeks[r.weeks.length - 1];
    expect(finalWeek[0].date).toBe("2026-03-15");
    expect(finalWeek[0].future).toBe(false);
    expect(finalWeek[1].future).toBe(true);
  });
});

describe("consistency vs earnings", () => {
  it("compares high-posting weeks against low-posting weeks", () => {
    const start = "2026-01-04"; // a Sunday
    const days: DailyActivity[] = [];
    for (let week = 0; week < 8; week++) {
      const heavy = week % 2 === 0;
      for (let d = 0; d < 7; d++) {
        const date = addDays(start, week * 7 + d);
        days.push({
          date,
          posts: heavy ? (d < 6 ? 1 : 0) : d === 0 ? 1 : 0,
          earnings: heavy ? 200 : 100,
        });
      }
    }
    const today = days[days.length - 1].date;
    const r = analyse({ days, frozenDates: [], today, unlockedBadges: [] });
    expect(r.correlation).not.toBeNull();
    expect(r.correlation!.upliftPct).toBe(100);
  });

  it("stays null when earnings are unavailable", () => {
    const days = window(TODAY, 60, { "2026-03-15": 1 });
    const r = analyse({ days, frozenDates: [], today: TODAY, unlockedBadges: [] });
    expect(r.correlation).toBeNull();
  });
});
