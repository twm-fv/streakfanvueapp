import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer, getUserState } from "@/lib/app";
import { getStore } from "@/lib/store";
import { isSameOrigin, jsonError, rateLimit } from "@/lib/http";
import { isValidTimezone } from "@/lib/streak/dates";
import { remindersLive } from "@/env";

const bodySchema = z.object({
  enabled: z.boolean().optional(),
  days: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  hour: z.number().int().min(0).max(23).optional(),
  /** IANA name. Setting it marks the timezone as chosen by the creator. */
  timezone: z.string().min(1).max(64).optional(),
  /** True when the creator changed days or time by hand, so auto-defaults stop. */
  customised: z.boolean().optional(),
});

export async function PUT(request: Request) {
  if (!isSameOrigin(request)) return jsonError(403, "Cross-origin request rejected");
  if (!remindersLive()) return jsonError(503, "Reminders are not available on this deployment yet");

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
    customised: state.nudge.customised || body.customised === true,
  };

  const next = {
    ...state,
    nudge,
    timezone: body.timezone ?? state.timezone,
    timezoneChosen: state.timezoneChosen || body.timezone !== undefined,
  };

  await getStore().putUserState(next);
  return NextResponse.json({ ok: true, nudge, timezone: next.timezone });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
