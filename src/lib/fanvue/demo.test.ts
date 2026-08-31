import { describe, expect, it } from "vitest";
import { DemoSource } from "./demo";
import { analyse } from "@/lib/streak/engine";
import { todayIn } from "@/lib/streak/dates";

/**
 * Demo mode is what a reviewer sees first, so it has to exercise every panel.
 * These assertions fail if the sample data stops telling a complete story.
 */
describe("demo mode", () => {
  const timezone = "Europe/London";

  async function summary() {
    const window = await new DemoSource().getActivity(140, timezone);
    return {
      window,
      result: analyse({
        days: window.days,
        frozenDates: [],
        today: todayIn(timezone),
        unlockedBadges: [],
      }),
    };
  }

  it("produces a live streak", async () => {
    const { result } = await summary();
    expect(result.currentStreak).toBeGreaterThanOrEqual(20);
  });

  it("produces a closed break so the comeback panel has data", async () => {
    const { result } = await summary();
    expect(result.comeback.breaks).toBeGreaterThan(0);
    expect(result.comeback.averageDaysToReturn).not.toBeNull();
  });

  it("produces both busy and quiet weeks so consistency can be compared", async () => {
    const { result } = await summary();
    expect(result.correlation).not.toBeNull();
    expect(result.correlation!.highPostAvg).toBeGreaterThan(result.correlation!.lowPostAvg);
  });

  it("covers the full requested window with earnings", async () => {
    const { window } = await summary();
    expect(window.days).toHaveLength(140);
    expect(window.earningsAvailable).toBe(true);
  });
});
