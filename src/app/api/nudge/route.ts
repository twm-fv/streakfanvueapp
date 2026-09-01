import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer, getUserState } from "@/lib/app";
import { getStore } from "@/lib/store";
import { isSameOrigin, jsonError, rateLimit } from "@/lib/http";
import { isValidTimezone } from "@/lib/streak/dates";
import { randomId } from "@/lib/crypto";

const bodySchema = z.object({
  enabled: z.boolean().optional(),
  days: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  hour: z.number().int().min(0).max(23).optional(),
  /** IANA name. Setting it marks the timezone as chosen by the creator. */
  timezone: z.string().min(1).max(64).optional(),
  /** Issue a new calendar feed URL and retire the old one. */
  rotateCalendar: z.boolean().optional(),
});

export async function PUT(request: Request) {
  if (!isSameOrigin(request)) return jsonError(403, "Cross-origin request rejected");

  const viewer = await getViewer();
  if (!viewer) return jsonError(401, "Not connected");
  if (!rateLimit(`nudge:${viewer.userId}`, 30)) return jsonError(429, "Too many requests");

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Invalid reminder settings");
  const body = parsed.data;

  if (body.timezone !== undefined && !isValidTimezone(body.timezone)) {
    return jsonError(400, "Unknown timezone");
  }

  const state = await getUserState(viewer);
  const nudge = {
    ...state.nudge,
    enabled: body.enabled ?? state.nudge.enabled,
    days: body.days ?? state.nudge.days,
    hour: body.hour ?? state.nudge.hour,
  };

  const next = {
    ...state,
    nudge,
    timezone: body.timezone ?? state.timezone,
    timezoneChosen: state.timezoneChosen || body.timezone !== undefined,
    // The feed URL exists from the moment reminders are on, so it can be
    // subscribed to straight away.
    calendarToken:
      body.rotateCalendar || (nudge.enabled && !state.calendarToken)
        ? randomId(24)
        : state.calendarToken,
  };

  await getStore().putUserState(next);
  return NextResponse.json({
    ok: true,
    nudge,
    timezone: next.timezone,
    calendarPath: next.calendarToken ? `/api/calendar/${next.calendarToken}.ics` : null,
  });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
