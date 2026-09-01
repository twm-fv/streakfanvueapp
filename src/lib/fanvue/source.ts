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
import { addDays, eachDay, isValidTimezone, toLocalDate } from "@/lib/streak/dates";

const POST_DATE_KEYS = [
  "publishedAt",
  "published_at",
  "createdAt",
  "created_at",
  "postedAt",
  "date",
];
const EARNING_DATE_KEYS = ["date", "day", "paidAt", "paid_at", "periodStart", "period_start", "createdAt"];
const EARNING_AMOUNT_KEYS = ["amount", "total", "gross", "net", "earnings", "value", "sum"];


/** Hard cap so a creator with years of posts cannot make one request paginate forever. */
const MAX_PAGES = 25;

/**
 * Turns an API failure into something a creator can act on. A 403 means the
 * token lacks the scope, which reconnecting fixes; a 404 means the endpoint
 * path is wrong, which is the operator's problem, not theirs.
 */
function describeFailure(error: unknown, what: string, scope: string): string {
  if (error instanceof FanvueApiError) {
    if (error.status === 403) {
      return `Streak is not authorised to read ${what}. Reconnect and grant the ${scope} permission.`;
    }
    return `Could not read ${what} (the Fanvue API returned ${error.status}).`;
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
    if (hasScope(this.grantedScopes, SCOPE_POSTS)) {
      try {
        await this.collectPosts({ start, timezone, counts });
      } catch (error) {
        warnings.push(describeFailure(error, "your posts", SCOPE_POSTS));
      }
    } else {
      warnings.push(
        `Posting history needs the ${SCOPE_POSTS} scope. Reconnect and grant it to see your streak.`,
      );
    }

    let earnings: Map<string, number> | null = null;
    if (hasScope(this.grantedScopes, SCOPE_INSIGHTS)) {
      try {
        earnings = await this.collectEarnings(start, today);
        if (earnings.size === 0) {
          warnings.push("No daily earnings were returned for this period.");
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

    return { days, earningsAvailable: earnings !== null, warnings };
  }

  /** Walks pages newest-first and stops as soon as it passes the window start. */
  private async collectPosts({
    start,
    timezone,
    counts,
  }: {
    start: string;
    timezone: string;
    counts: Map<string, number>;
  }): Promise<void> {
    let cursor: string | null = null;
    let page = 1;

    for (let i = 0; i < MAX_PAGES; i++) {
      const payload = await this.client.get<unknown>(env.API_POSTS_PATH, {
        size: 100,
        ...(cursor ? { cursor } : { page }),
      });
      const items = extractList(payload);
      if (items.length === 0) return;

      let inWindow = 0;
      let older = 0;
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const iso = pickString(item as Record<string, unknown>, POST_DATE_KEYS);
        if (!iso) continue;
        const instant = new Date(iso);
        if (Number.isNaN(instant.getTime())) continue;

        const date = toLocalDate(instant, timezone);
        if (date < start) {
          older++;
          continue;
        }
        inWindow++;
        counts.set(date, (counts.get(date) ?? 0) + 1);
      }

      // Posts come back pinned first, then newest first. A pinned post can be
      // years old, so a single out-of-window post near the top must not end the
      // walk - that would silently truncate the whole history. Only a page with
      // nothing in the window means we are genuinely past it.
      if (inWindow === 0 && older > 0) return;
      cursor = extractNextCursor(payload);
      page += 1;
      if (!cursor && items.length < 100) return;
    }
  }

  /**
   * Earnings come back as cursor-paginated individual transactions, not daily
   * totals, so this walks every page and aggregates by day itself. Stopping at
   * page one would quietly under-report any creator busy enough to fill it.
   *
   * Each row also carries details of the fan who paid. Only the date and amount
   * are read; nothing identifying a fan is kept, logged or stored.
   */
  private async collectEarnings(start: string, end: string): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    let cursor: string | null = null;

    for (let i = 0; i < MAX_PAGES; i++) {
      const payload: unknown = await this.client.get<unknown>(
        env.API_INSIGHTS_EARNINGS_PATH,
        {
          startDate: start,
          endDate: end,
          size: 100,
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
        // Refunds and chargebacks arrive as negative rows, so a day nets out.
        const date = rawDate.slice(0, 10);
        out.set(date, (out.get(date) ?? 0) + amount);
      }

      cursor = extractNextCursor(payload);
      if (!cursor || items.length === 0) return out;
    }
    return out;
  }
}
