import webpush from "web-push";
import { env, pushConfigured } from "@/env";
import type { PushSubscriptionRecord } from "@/lib/store";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  if (!pushConfigured()) throw new Error("Web Push is not configured on this deployment");
  webpush.setVapidDetails(env.VAPID_SUBJECT!, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
  configured = true;
}

export type PushPayload = {
  title: string;
  body: string;
  /** Where a tap should land. */
  url: string;
  /** Collapses repeats of the same reminder on the device. */
  tag: string;
};

/**
 * Sends one payload to every subscription and reports which ones the push
 * service says are dead, so the caller can prune them. A failure on one
 * device never stops delivery to the others.
 */
export async function sendPush(
  subscriptions: PushSubscriptionRecord[],
  payload: PushPayload,
): Promise<{ delivered: number; expired: string[] }> {
  ensureConfigured();
  const expired: string[] = [];
  let delivered = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 6, urgency: "normal" },
        );
        delivered++;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        // 404 and 410 mean the subscription is gone for good.
        if (status === 404 || status === 410) expired.push(sub.endpoint);
        // Anything else is transient; the next hourly run tries again.
      }
    }),
  );

  return { delivered, expired };
}
