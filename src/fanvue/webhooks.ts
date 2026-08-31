import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

const TOLERANCE_MS = 5 * 60_000;

export interface WebhookEvent {
  type: string;
  data?: Record<string, unknown>;
}

/**
 * Verifies the signature on an inbound Fanvue webhook over the raw request body.
 * Header layout is confirmed at app registration; both the exact header names and the
 * signed payload format are worth re-checking against the first live delivery.
 */
export function verifyWebhookSignature(input: {
  rawBody: string;
  signature: string | undefined;
  timestamp: string | undefined;
  now?: number;
}): { ok: true } | { ok: false; reason: string } {
  if (config.FANVUE_WEBHOOK_SECRET === '') return { ok: false, reason: 'FANVUE_WEBHOOK_SECRET is not set' };
  if (!input.signature) return { ok: false, reason: 'missing signature header' };
  if (!input.timestamp) return { ok: false, reason: 'missing timestamp header' };

  const sentAt = Number(input.timestamp);
  if (!Number.isFinite(sentAt)) return { ok: false, reason: 'timestamp header is not a number' };
  const now = input.now ?? Date.now();
  if (Math.abs(now - sentAt) > TOLERANCE_MS) return { ok: false, reason: 'timestamp outside tolerance' };

  const expected = createHmac('sha256', config.FANVUE_WEBHOOK_SECRET)
    .update(`${input.timestamp}.${input.rawBody}`)
    .digest('hex');
  const provided = Buffer.from(input.signature, 'utf8');
  const computed = Buffer.from(expected, 'utf8');
  if (provided.length !== computed.length || !timingSafeEqual(provided, computed)) {
    return { ok: false, reason: 'signature mismatch' };
  }
  return { ok: true };
}

export const HANDLED_EVENTS = [
  'payment.success',
  'payment.failed',
  'subscription.success',
  'subscription.failed',
  'subscription.expiring',
  'subscription.ended',
  'app.uninstalled',
] as const;

export type HandledEvent = (typeof HANDLED_EVENTS)[number];

export function isHandledEvent(type: string): type is HandledEvent {
  return (HANDLED_EVENTS as readonly string[]).includes(type);
}
