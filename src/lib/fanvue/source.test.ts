import { describe, expect, it } from "vitest";
import { FanvueSource } from "./source";
import type { FanvueClient } from "./client";
import { addDays, todayIn } from "@/lib/streak/dates";

const TZ = "UTC";
const SCOPES = "read:self read:post read:insights";

/** Records every request so a test can assert how far pagination walked. */
function fakeClient(handler: (path: string, query: Record<string, unknown>) => unknown) {
  const calls: { path: string; query: Record<string, unknown> }[] = [];
  const client = {
    get: async (path: string, query: Record<string, unknown> = {}) => {
      calls.push({ path, query });
      return handler(path, query);
    },
  };
  return { client: client as unknown as FanvueClient, calls };
}

function post(date: string) {
  return { publishedAt: `${date}T12:00:00.000Z` };
}

/** A full page, so the "short page means no more pages" rule does not fire. */
const PAGE = 100;

describe("post collection", () => {
  it("keeps paginating past a pinned post that predates the window", async () => {
    const today = todayIn(TZ);

    // Real ordering: pinned posts first, then newest first. A pinned post can be
    // years old, so page one opens outside the window and continues inside it.
    const pageOne = [post(addDays(today, -730))];
    for (let i = 0; i < PAGE - 1; i++) pageOne.push(post(addDays(today, -(i % 10))));

    // A creator busy enough to fill page one still has posts on page two.
    const pageTwo = Array.from({ length: PAGE }, (_, i) => post(addDays(today, -(10 + (i % 10)))));

    // Everything beyond is outside the window, so the walk should stop here.
    const pageThree = Array.from({ length: PAGE }, () => post(addDays(today, -800)));

    const { client, calls } = fakeClient((path) => {
      if (!path.includes("posts")) return { data: [] };
      const call = calls.filter((c) => c.path.includes("posts")).length;
      return { data: [pageOne, pageTwo, pageThree][call - 1] ?? [] };
    });

    const window = await new FanvueSource("token", SCOPES, client).getActivity(30, TZ);
    const total = window.days.reduce((sum, d) => sum + d.posts, 0);

    // 99 in-window on page one plus 100 on page two. Stopping at the pinned post
    // would have given 99 and quietly lost half the history.
    expect(total).toBe(199);
    expect(calls.filter((c) => c.path.includes("posts")).length).toBe(3);
    expect(window.warnings.join(" ")).not.toContain("posts");
  });

  it("stops once an entire page falls outside the window", async () => {
    const today = todayIn(TZ);
    const { client, calls } = fakeClient((path) => {
      if (!path.includes("posts")) return { data: [] };
      const call = calls.filter((c) => c.path.includes("posts")).length;
      if (call === 1) return { data: Array.from({ length: PAGE }, () => post(today)) };
      return { data: Array.from({ length: PAGE }, () => post(addDays(today, -800))) };
    });

    await new FanvueSource("token", SCOPES, client).getActivity(30, TZ);
    // Page one is in window, page two is entirely outside it. A third would be waste.
    expect(calls.filter((c) => c.path.includes("posts")).length).toBe(2);
  });

  it("stops on a short page without asking for another", async () => {
    const today = todayIn(TZ);
    const { client, calls } = fakeClient((path) => {
      if (!path.includes("posts")) return { data: [] };
      return { data: [post(today), post(addDays(today, -1))] };
    });

    await new FanvueSource("token", SCOPES, client).getActivity(30, TZ);
    expect(calls.filter((c) => c.path.includes("posts")).length).toBe(1);
  });
});

describe("earnings collection", () => {
  it("follows the cursor instead of reading only the first page", async () => {
    const today = todayIn(TZ);
    const { client, calls } = fakeClient((path, query) => {
      if (path.includes("posts")) return { data: [] };
      if (!query.cursor) {
        return { data: [{ date: today, amount: 100 }], pagination: { nextCursor: "page-2" } };
      }
      return { data: [{ date: today, amount: 50 }] };
    });

    const window = await new FanvueSource("token", SCOPES, client).getActivity(30, TZ);
    const todayRow = window.days.find((d) => d.date === today);

    // 100 from page one plus 50 from page two; stopping early would give 100.
    expect(todayRow?.earnings).toBe(150);
    expect(calls.filter((c) => !c.path.includes("posts")).length).toBe(2);
  });

  it("nets refunds out of the day they belong to", async () => {
    const today = todayIn(TZ);
    const { client } = fakeClient((path) => {
      if (path.includes("posts")) return { data: [] };
      return {
        data: [
          { date: today, amount: 200 },
          { date: today, amount: -75 },
        ],
      };
    });

    const window = await new FanvueSource("token", SCOPES, client).getActivity(30, TZ);
    expect(window.days.find((d) => d.date === today)?.earnings).toBe(125);
  });

  it("reports earnings as unavailable without the insights scope", async () => {
    const { client } = fakeClient(() => ({ data: [] }));
    const window = await new FanvueSource("token", "read:self read:post", client).getActivity(30, TZ);
    expect(window.earningsAvailable).toBe(false);
    expect(window.days.every((d) => d.earnings === null)).toBe(true);
  });

  it("warns, rather than failing, when the posts scope is missing", async () => {
    const { client } = fakeClient(() => ({ data: [] }));
    const window = await new FanvueSource("token", "read:self", client).getActivity(30, TZ);
    expect(window.warnings.join(" ")).toContain("read:post");
    expect(window.days.every((d) => d.posts === 0)).toBe(true);
  });
});
