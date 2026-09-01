import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer, getUserState } from "@/lib/app";
import { getStore, type PushSubscriptionRecord } from "@/lib/store";
import { isSameOrigin, jsonError, rateLimit } from "@/lib/http";
import { remindersLive } from "@/env";

const subscriptionSchema = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  userAgent: z.string().max(200).optional(),
});

const MAX_DEVICES = 8;

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError(403, "Cross-origin request rejected");
  if (!remindersLive()) return jsonError(503, "Reminders are not available on this deployment yet");

  const viewer = await getViewer();
  if (!viewer) return jsonError(401, "Not connected");
  if (!rateLimit(`push:${viewer.userId}`, 20)) return jsonError(429, "Too many requests");

  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "That does not look like a push subscription");

  const state = await getUserState(viewer);
  const record: PushSubscriptionRecord = {
    endpoint: parsed.data.endpoint,
    keys: parsed.data.keys,
    userAgent: parsed.data.userAgent,
    createdAt: new Date().toISOString(),
  };
  // Re-subscribing from the same browser replaces rather than duplicates.
  const others = (state.pushSubscriptions ?? []).filter((s) => s.endpoint !== record.endpoint);
  const pushSubscriptions = [...others, record].slice(-MAX_DEVICES);

  await getStore().putUserState({ ...state, pushSubscriptions });
  return NextResponse.json({ ok: true, devices: pushSubscriptions.length });
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return jsonError(403, "Cross-origin request rejected");

  const viewer = await getViewer();
  if (!viewer) return jsonError(401, "Not connected");

  const parsed = z
    .object({ endpoint: z.url() })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Expected an endpoint");

  const state = await getUserState(viewer);
  const pushSubscriptions = (state.pushSubscriptions ?? []).filter(
    (s) => s.endpoint !== parsed.data.endpoint,
  );
  await getStore().putUserState({ ...state, pushSubscriptions });
  return NextResponse.json({ ok: true, devices: pushSubscriptions.length });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
