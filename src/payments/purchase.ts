import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { creditPack } from './credits.js';
import { JsonStore } from '../store/jsonStore.js';

export interface PurchaseRequest {
  id: string;
  creatorId: string;
  minutes: number;
  priceCents: number;
  status: 'pending' | 'paid' | 'failed';
  /** True while PAYMENTS_ENABLED is false: no Fanvue payment session was created. */
  stubbed: boolean;
  createdAt: number;
}

const store = new JsonStore<PurchaseRequest>('purchases');

/**
 * Backend half of the payment flow. With PAYMENTS_ENABLED=false this records a stub and
 * returns it, so the frontend can exercise the postMessage path without real credentials.
 * With payments on, this is where the Fanvue payment-session call goes; the endpoint and
 * its payload arrive with app registration.
 */
export async function createPurchaseRequest(creatorId: string): Promise<PurchaseRequest> {
  const request: PurchaseRequest = {
    id: randomUUID(),
    creatorId,
    minutes: creditPack.minutes,
    priceCents: creditPack.priceCents,
    status: 'pending',
    stubbed: !config.PAYMENTS_ENABLED,
    createdAt: Date.now(),
  };

  if (config.PAYMENTS_ENABLED) {
    throw new Error(
      'Live payments are not wired yet: register the app, then call the Fanvue payment-session endpoint here.',
    );
  }

  store.set(request.id, request);
  return request;
}

export function getPurchaseRequest(id: string): PurchaseRequest | undefined {
  return store.get(id);
}

export function markPurchase(id: string, status: PurchaseRequest['status']): PurchaseRequest | undefined {
  const current = store.get(id);
  if (!current) return undefined;
  const next = { ...current, status };
  store.set(id, next);
  return next;
}
