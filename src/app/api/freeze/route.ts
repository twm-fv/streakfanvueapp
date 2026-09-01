import { NextResponse } from "next/server";
import { getViewer, buildDashboard } from "@/lib/app";
import { getStore, MAX_FREEZES_PER_MONTH } from "@/lib/store";
import { monthOf } from "@/lib/streak/dates";
import { isSameOrigin, jsonError, rateLimit } from "@/lib/http";

/**
 * Covers the whole gap between the last active day and today.
 *
 * The client sends no dates: which days need covering is derived here from the
 * creator's real history, so there is nothing to forge. Covering part of a gap
 * would leave the streak broken anyway, so it is all or nothing.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError(403, "Cross-origin request rejected");

  const viewer = await getViewer();
  if (!viewer) return jsonError(401, "Not connected");
  if (!rateLimit(`freeze:${viewer.userId}`, 20)) return jsonError(429, "Too many requests");

  const { summary, state } = await buildDashboard(viewer);
  const { coverDates, gapLength, available } = summary.freezes;

  if (gapLength === 0) return jsonError(422, "There is no missed day to cover");
  if (coverDates.length === 0) {
    return jsonError(
      422,
      `Covering this gap needs ${gapLength} freeze${gapLength === 1 ? "" : "s"} and you have ${available} left this month`,
    );
  }

  const frozenDates = [...new Set([...state.frozenDates, ...coverDates])].sort();
  // Guard against a double submit racing past the check above.
  const used = frozenDates.filter((d) => monthOf(d) === monthOf(coverDates[0])).length;
  if (used > MAX_FREEZES_PER_MONTH) return jsonError(422, "Freeze allowance exceeded");

  await getStore().putUserState({ ...state, frozenDates });
  return NextResponse.json({ ok: true, covered: coverDates });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
