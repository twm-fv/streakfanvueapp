import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer, getUserState } from "@/lib/app";
import { getStore } from "@/lib/store";
import { isSameOrigin, jsonError, rateLimit } from "@/lib/http";

const bodySchema = z.object({
  enabled: z.boolean(),
  days: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  hour: z.number().int().min(0).max(23).optional(),
});

export async function PUT(request: Request) {
  if (!isSameOrigin(request)) return jsonError(403, "Cross-origin request rejected");

  const viewer = await getViewer();
  if (!viewer) return jsonError(401, "Not connected");
  if (!rateLimit(`nudge:${viewer.userId}`, 30)) return jsonError(429, "Too many requests");

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Invalid reminder settings");

  const state = await getUserState(viewer);
  const nudge = {
    enabled: parsed.data.enabled,
    days: parsed.data.days ?? state.nudge.days,
    hour: parsed.data.hour ?? state.nudge.hour,
  };
  await getStore().putUserState({ ...state, nudge });
  return NextResponse.json({ ok: true, nudge });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
