import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer, buildDashboard } from "@/lib/app";
import { getStore, MAX_FREEZES_PER_MONTH } from "@/lib/store";
import { monthOf } from "@/lib/streak/dates";
import { isSameOrigin, jsonError, rateLimit } from "@/lib/http";

const bodySchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError(403, "Cross-origin request rejected");

  const viewer = await getViewer();
  if (!viewer) return jsonError(401, "Not connected");
  if (!rateLimit(`freeze:${viewer.userId}`, 20)) return jsonError(429, "Too many requests");

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Expected a date in YYYY-MM-DD form");
  const { date } = parsed.data;

  // Re-derive eligibility server side. The button is a convenience; this is the
  // rule. A client cannot freeze an arbitrary day by posting a different date.
  const { summary, state } = await buildDashboard(viewer);
  if (!summary.freezes.eligibleDates.includes(date)) {
    return jsonError(422, "That day cannot be frozen");
  }
  if (summary.freezes.available <= 0) {
    return jsonError(422, `You have used all ${MAX_FREEZES_PER_MONTH} freezes this month`);
  }

  const next = { ...state, frozenDates: [...state.frozenDates, date].sort() };
  // Guard against a double submit racing past the check above.
  const used = next.frozenDates.filter((d) => monthOf(d) === monthOf(date)).length;
  if (used > MAX_FREEZES_PER_MONTH) return jsonError(422, "Freeze allowance exceeded");

  await getStore().putUserState(next);
  return NextResponse.json({ ok: true, date });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
