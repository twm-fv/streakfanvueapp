import { config } from '../config.js';
import { JsonStore } from '../store/jsonStore.js';

export interface CreditBalance {
  creatorId: string;
  /** Rendered minutes still available. Credit packs are per rendered minute. */
  minutes: number;
  updatedAt: number;
}

const store = new JsonStore<CreditBalance>('credits');

/** Free minutes handed to a pilot creator on install so the first render needs no payment. */
const PILOT_GRANT_MINUTES = 10;

export function balanceFor(creatorId: string): number {
  return store.get(creatorId)?.minutes ?? 0;
}

export function grantPilotCredits(creatorId: string): void {
  if (store.get(creatorId)) return;
  store.set(creatorId, { creatorId, minutes: PILOT_GRANT_MINUTES, updatedAt: Date.now() });
}

export function addMinutes(creatorId: string, minutes: number): number {
  const next = balanceFor(creatorId) + minutes;
  store.set(creatorId, { creatorId, minutes: next, updatedAt: Date.now() });
  return next;
}

export class InsufficientCreditsError extends Error {
  constructor(readonly required: number, readonly available: number) {
    super(`render needs ${required} minutes, creator has ${available}`);
    this.name = 'InsufficientCreditsError';
  }
}

export function chargeMinutes(creatorId: string, minutes: number): number {
  const available = balanceFor(creatorId);
  if (available < minutes) throw new InsufficientCreditsError(minutes, available);
  return addMinutes(creatorId, -minutes);
}

/** Source minutes are billed rounded up: a 3m10s video costs 4 minutes. */
export function minutesForSource(durationMs: number): number {
  return Math.max(1, Math.ceil(durationMs / 60_000));
}

export const creditPack = {
  minutes: config.CREDIT_PACK_MINUTES,
  priceCents: config.CREDIT_PACK_PRICE_CENTS,
};
