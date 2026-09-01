import { env } from "@/env";
import {
  extractList,
  extractNextCursor,
  FanvueClient,
  FanvueApiError,
  pickNumber,
  pickString,
} from "./client";
import { hasScope, SCOPE_POSTS, SCOPE_INSIGHTS } from "./scopes";
import type { ActivitySource, ActivityWindow, DailyActivity, Profile } from "./types";
import { addDays, eachDay, isValidTimezone, localHour, toLocalDate } from "@/lib/streak/dates";

const POST_DATE_KEYS = [
  "publishedAt",
  "published_at",
  "createdAt",
  "created_at",
  "postedAt",
  "date",
];
const EARNING_DATE_KEYS = ["date", "day", "paidAt", "paid_at", "periodStart", "period_start", "createdAt"];
/**
 * `net` first: gross is what the fan paid, net is what the creator actually
 * keeps after platform fees, which is the number a creator recognises as their
 * earnings.
 */
const EARNING_AMOUNT_KEYS = ["net", "gross", "amount", "total", "earnings", "value", "sum"];


/**
 * The API caps page size at 50 and allows 100 requests per minute per user.
 * Twenty pages each for posts and earnings keeps one dashboard load well inside
 * that budget while still covering a busy creator's window.
 */
const PAGE_SIZE = 50;
const MAX_PAGES = 20;

/** The API returns integer minor units; every amount is divided by this once. */
const MINOR_UNITS_PER_MAJOR = 100;

/**
 * Turns an API failure into something a creator can act on. A 403 means the
 * token lacks the scope, which reconnecting fixes; a 404 means the endpoint
 * path is wrong, which is the operator's problem, not theirs.
 */
/**
 * Page-based responses carry pagination.hasMore. Returns null when the envelope
 * does not say, so the caller can fall back to its own heuristic.
 */
function hasMorePages(payload: unknown): boolean | null {
  if (!payload || typeof payload !== "object") return null;
  const pagination = (payload as Record<string, unknown>).pagination;
  if (!pagination || typeof pagination !== "object") return null;
  const more = (pagination as Record<string, unknown>).hasMore;
  return typeof more === "boolean" ? more : null;
}

function describeFailure(error: unknown, what: string, scope: string): string {
  if (error instanceof FanvueApiError) {
    if (error.status === 403) {
      return `Streak is not authorised to read ${what}. Reconnect and grant the ${scope} permission.`;
    }
    return error.detail
      ? `Could not read ${what}: the Fanvue API rejected the request (${error.status}) - ${error.detail}`
      : `Could not read ${what} (the Fanvue API returned ${error.status}).`;
  }
  return `Could not read ${what}.`;
}

export class FanvueSource implements ActivitySource {
  private client: FanvueClient;

  constructor(
    accessToken: string,
    private grantedScopes: string,
    /** Injectable so pagination can be tested without a live API. */
    client?: FanvueClient,
  ) {
    this.client = client ?? new FanvueClient(accessToken);
  }

  async getProfile(): Promise<Profile> {
    const raw = await this.client.get<Record<string, unknown>>("/users/me");
    // The profile envelope may or may not wrap the user object.
    const user = (raw.data ?? raw.user ?? raw) as Record<string, unknown>;
    const timezone = pickString(user, ["timezone", "timeZone", "tz"]);
    return {
      id:
        pickString(user, ["uuid", "id", "userUuid", "sub"]) ??
        // A stable id is required to key stored state. Refuse rather than guess.
        (() => {
          throw new Error("Fanvue profile did not include a stable user id");
        })(),
      displayName:
        pickString(user, ["displayName", "display_name", "name", "handle", "username"]) ??
        "Creator",
      handle: pickString(user, ["handle", "username", "slug"]),
      avatarUrl: pickString(user, ["avatarUrl", "avatar_url", "profileImageUrl", "avatar"]),
      timezone: timezone && isValidTimezone(timezone) ? timezone : "UTC",
    };
  }

  async getActivity(historyDays: number, timezone: string): Promise<ActivityWindow> {
    const warnings: string[] = [];
    const today = toLocalDate(new Date(), timezone);
    const start = addDays(today, -(historyDays - 1));

    const counts = new Map<string, number>();
    const hours = Array.from({ length: 24 }, () => 0);
    let postsSeen = 0;
    let postsDated = 0;
    if (hasScope(this.grantedScopes, SCOPE_POSTS)) {
      try {
        const tally = await this.collectPosts({ start, timezone, counts, hours });
        postsSeen = tally.seen;
        postsDated = tally.dated;
        // An empty heatmap has two very different causes: an account with
        // nothing posted yet, and posts we failed to read. Say which.
        if (postsSeen > 0 && postsDated === 0) {
          warnings.push(
            `Fanvue returned ${postsSeen} post${postsSeen === 1 ? "" : "s"}, but none carried a ` +
              `publication date in a field Streak recognises, so the streak cannot be counted.`,
          );
        }
      } catch (error) {
        warnings.push(describeFailure(error, "your posts", SCOPE_POSTS));
      }
    } else {
      warnings.push(
        `Posting history needs the ${SCOPE_POSTS} scope. Reconnect and grant it to see your streak.`,
      );
    }

    let earnings: Map<string, number> | null = null;
    let currency = "USD";
    if (hasScope(this.grantedScopes, SCOPE_INSIGHTS)) {
      try {
        const collected = await this.collectEarnings(start, today, timezone);
        earnings = collected.byDate;
        currency = collected.currency ?? currency;
        if (earnings.size === 0) {
          warnings.push("No earnings were returned for this period.");
        }
      } catch (error) {
        warnings.push(describeFailure(error, "earnings insights", SCOPE_INSIGHTS));
      }
    }

    const days: DailyActivity[] = eachDay(start, today).map((date) => ({
      date,
      posts: counts.get(date) ?? 0,
      earnings: earnings ? (earnings.get(date) ?? 0) : null,
    }));

    return {
      days,
      earningsAvailable: earnings !== null,
      currency,
      postsFound: postsSeen,
      postingHours: hours,
      warnings,
    };
  }

  /** Walks pages newest-first and stops as soon as it passes the window start. */
  private async collectPosts({
    start,
    timezone,
    counts,
    hours,
  }: {
    start: string;
    timezone: string;
    counts: Map<string, number>;
    /** 24 buckets; the hour each in-window post went out, in the creator's timezone. */
    hours: number[];
  }): Promise<{ seen: number; dated: number }> {
    let cursor: string | null = null;
    let page = 1;
    let seen = 0;
    let dated = 0;

    for (let i = 0; i < MAX_PAGES; i++) {
      const payload = await this.client.get<unknown>(env.API_POSTS_PATH, {
        size: PAGE_SIZE,
        ...(cursor ? { cursor } : { page }),
      });
      const items = extractList(payload);
      if (items.length === 0) return { seen, dated };

      let inWindow = 0;
      let older = 0;
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        seen++;
        const iso = pickString(item as Record<string, unknown>, POST_DATE_KEYS);
        if (!iso) continue;
        const instant = new Date(iso);
        if (Number.isNaN(instant.getTime())) continue;
        dated++;

        const date = toLocalDate(instant, timezone);
        if (date < start) {
          older++;
          continue;
        }
        inWindow++;
        counts.set(date, (counts.get(date) ?? 0) + 1);
        hours[localHour(instant, timezone)]++;
      }

      // Posts come back pinned first, then newest first. A pinned post can be
      // years old, so a single out-of-window post near the top must not end the
      // walk - that would silently truncate the whole history. Only a page with
      // nothing in the window means we are genuinely past it.
      if (inWindow === 0 && older > 0) return { seen, dated };
      cursor = extractNextCursor(payload);
      page += 1;
      // Page-based responses say outright whether more pages exist; only fall
      // back to inferring from a short page when they do not.
      const more = hasMorePages(payload);
      if (more === false) return { seen, dated };
      if (more === null && !cursor && items.length < PAGE_SIZE) return { seen, dated };
    }
    return { seen, dated };
  }

  /**
   * Earnings come back as cursor-paginated individual transactions, not daily
   * totals, so this walks every page and aggregates by day itself. Stopping at
   * page one would quietly under-report any creator busy enough to fill it.
   *
   * Each row also carries details of the fan who paid. Only the date and amount
   * are read; nothing identifying a fan is kept, logged or stored.
   */
  private async collectEarnings(
    start: string,
    end: string,
    timezone: string,
  ): Promise<{ byDate: Map<string, number>; currency: string | null }> {
    const out = new Map<string, number>();
    let currency: string | null = null;
    let cursor: string | null = null;

    for (let i = 0; i < MAX_PAGES; i++) {
      const payload: unknown = await this.client.get<unknown>(
        env.API_INSIGHTS_EARNINGS_PATH,
        {
          // These take an ISO 8601 datetime, not a bare date. A date-only value
          // fails validation with a 400.
          startDate: `${start}T00:00:00Z`,
          endDate: `${end}T23:59:59Z`,
          size: PAGE_SIZE,
          ...(cursor ? { cursor } : {}),
        },
      );

      const items = extractList(payload);
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const row = item as Record<string, unknown>;
        const rawDate = pickString(row, EARNING_DATE_KEYS);
        const amount = pickNumber(row, EARNING_AMOUNT_KEYS);
        if (!rawDate || amount === null) continue;
        currency ??= pickString(row, ["currency"]);
        // Bucket by the creator's own day, matching how posts are counted, so a
        // week's earnings line up with the same week's posts.
        const instant = new Date(rawDate);
        if (Number.isNaN(instant.getTime())) continue;
        const date = toLocalDate(instant, timezone);
        // Refunds and chargebacks arrive as their own negative rows, so a day
        // nets out on its own without special handling.
        out.set(date, (out.get(date) ?? 0) + amount / MINOR_UNITS_PER_MAJOR);
      }

      cursor = extractNextCursor(payload);
      if (!cursor || items.length === 0) break;
    }
    return { byDate: out, currency };
  }
}
