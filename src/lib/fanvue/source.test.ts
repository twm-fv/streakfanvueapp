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
const PAGE = 50;

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

    // 49 in-window on page one plus 50 on page two. Stopping at the pinned post
    // would have given 49 and quietly lost half the history.
    expect(total).toBe(99);
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
  /** The envelope shape documented in the API reference. */
  function earning(date: string, net: number, gross = net) {
    return { date: `${date}T12:00:00Z`, gross, net, currency: "USD", source: "subscription" };
  }

  it("converts minor units to major units", async () => {
    const today = todayIn(TZ);
    const { client } = fakeClient((path) => {
      if (path.includes("posts")) return { data: [] };
      // 1999 cents is $19.99, not $1,999.
      return { data: [earning(today, 1999)], nextCursor: null };
    });

    const window = await new FanvueSource("token", SCOPES, client).getActivity(30, TZ);
    expect(window.days.find((d) => d.date === today)?.earnings).toBeCloseTo(19.99, 2);
  });

  it("uses net rather than gross, so fees are not counted as earnings", async () => {
    const today = todayIn(TZ);
    const { client } = fakeClient((path) => {
      if (path.includes("posts")) return { data: [] };
      return { data: [earning(today, 1599, 1999)], nextCursor: null };
    });

    const window = await new FanvueSource("token", SCOPES, client).getActivity(30, TZ);
    expect(window.days.find((d) => d.date === today)?.earnings).toBeCloseTo(15.99, 2);
  });

  it("follows nextCursor instead of reading only the first page", async () => {
    const today = todayIn(TZ);
    const { client, calls } = fakeClient((path, query) => {
      if (path.includes("posts")) return { data: [] };
      if (!query.cursor) {
        return { data: [earning(today, 10000)], nextCursor: "eyJpZCI6IjEyMyJ9" };
      }
      return { data: [earning(today, 5000)], nextCursor: null };
    });

    const window = await new FanvueSource("token", SCOPES, client).getActivity(30, TZ);
    // $100 from page one plus $50 from page two; stopping early would give $100.
    expect(window.days.find((d) => d.date === today)?.earnings).toBeCloseTo(150, 2);
    expect(calls.filter((c) => !c.path.includes("posts")).length).toBe(2);
  });

  it("nets a reversal out of the day it belongs to", async () => {
    const today = todayIn(TZ);
    const { client } = fakeClient((path) => {
      if (path.includes("posts")) return { data: [] };
      // A reversal is its own invoice for the full amount, written negative.
      return { data: [earning(today, 20000), earning(today, -7500)], nextCursor: null };
    });

    const window = await new FanvueSource("token", SCOPES, client).getActivity(30, TZ);
    expect(window.days.find((d) => d.date === today)?.earnings).toBeCloseTo(125, 2);
  });

  it("sends ISO datetimes, since a bare date fails validation with a 400", async () => {
    const { client, calls } = fakeClient(() => ({ data: [] }));
    await new FanvueSource("token", SCOPES, client).getActivity(30, TZ);

    const insights = calls.filter((c) => !c.path.includes("posts"));
    expect(insights.length).toBeGreaterThan(0);
    for (const call of insights) {
      expect(String(call.query.startDate)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      expect(String(call.query.endDate)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    }
  });

  it("buckets earnings by the creator's day, not the UTC day", async () => {
    // 23:30 UTC on the 4th is 09:30 on the 5th in Sydney.
    const { client } = fakeClient((path) => {
      if (path.includes("posts")) return { data: [] };
      return {
        data: [{ date: "2026-08-04T23:30:00Z", net: 5000, gross: 5000, currency: "AUD" }],
        nextCursor: null,
      };
    });

    const source = new FanvueSource("token", SCOPES, client);
    const window = await source.getActivity(4000, "Australia/Sydney");
    const byDate = new Map(window.days.map((d) => [d.date, d.earnings]));
    expect(byDate.get("2026-08-05")).toBeCloseTo(50, 2);
    expect(byDate.get("2026-08-04")).toBe(0);
  });

  it("reports the currency the rows are denominated in", async () => {
    const today = todayIn(TZ);
    const { client } = fakeClient((path) => {
      if (path.includes("posts")) return { data: [] };
      return {
        data: [{ date: `${today}T12:00:00Z`, net: 1000, gross: 1000, currency: "EUR" }],
        nextCursor: null,
      };
    });

    const window = await new FanvueSource("token", SCOPES, client).getActivity(30, TZ);
    expect(window.currency).toBe("EUR");
  });

  it("requests no more than the documented maximum page size", async () => {
    const { client, calls } = fakeClient(() => ({ data: [] }));
    await new FanvueSource("token", SCOPES, client).getActivity(30, TZ);
    for (const call of calls) {
      expect(Number(call.query.size)).toBeLessThanOrEqual(50);
    }
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

describe("empty versus unreadable", () => {
  it("reports zero posts found when the account is genuinely empty", async () => {
    const { client } = fakeClient(() => ({ data: [] }));
    const window = await new FanvueSource("token", SCOPES, client).getActivity(30, TZ);
    expect(window.postsFound).toBe(0);
    expect(window.warnings.join(" ")).not.toContain("publication date");
  });

  it("warns when posts come back but none carry a readable date", async () => {
    const { client } = fakeClient((path) => {
      if (!path.includes("posts")) return { data: [] };
      // Posts exist, but under a date field name we do not recognise.
      return { data: [{ uuid: "a", somethingElse: "2026-08-30T10:00:00Z" }] };
    });

    const window = await new FanvueSource("token", SCOPES, client).getActivity(30, TZ);
    expect(window.postsFound).toBe(1);
    expect(window.warnings.join(" ")).toContain("publication date");
  });
});

describe("page-based pagination", () => {
  it("keeps going while pagination.hasMore is true", async () => {
    const today = todayIn(TZ);
    const { client, calls } = fakeClient((path) => {
      if (!path.includes("posts")) return { data: [] };
      const call = calls.filter((c) => c.path.includes("posts")).length;
      // Short pages, but hasMore says there is more to fetch.
      if (call < 3) {
        return { data: [post(today)], pagination: { page: call, size: 50, hasMore: true } };
      }
      return { data: [post(today)], pagination: { page: call, size: 50, hasMore: false } };
    });

    await new FanvueSource("token", SCOPES, client).getActivity(30, TZ);
    expect(calls.filter((c) => c.path.includes("posts")).length).toBe(3);
  });
});
