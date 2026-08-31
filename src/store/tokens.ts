import { JsonStore } from './jsonStore.js';
import { decrypt, encrypt } from './crypto.js';

export interface CreatorTokens {
  creatorId: string;
  /** AES-GCM ciphertext, never the raw token. */
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
  updatedAt: number;
}

interface StoredTokens extends Omit<CreatorTokens, 'accessToken' | 'refreshToken'> {
  accessToken: string;
  refreshToken: string;
}

const store = new JsonStore<StoredTokens>('tokens');

export function saveTokens(input: {
  creatorId: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
}): void {
  store.set(input.creatorId, {
    creatorId: input.creatorId,
    accessToken: encrypt(input.accessToken),
    refreshToken: encrypt(input.refreshToken),
    expiresAt: Date.now() + input.expiresIn * 1000,
    scope: input.scope,
    updatedAt: Date.now(),
  });
}

export function readTokens(
  creatorId: string,
): { accessToken: string; refreshToken: string; expiresAt: number; scope: string } | undefined {
  const stored = store.get(creatorId);
  if (!stored) return undefined;
  return {
    accessToken: decrypt(stored.accessToken),
    refreshToken: decrypt(stored.refreshToken),
    expiresAt: stored.expiresAt,
    scope: stored.scope,
  };
}

/** Called on uninstall and on any 401 from the API: Fanvue has revoked the grant. */
export function forgetCreator(creatorId: string): void {
  store.delete(creatorId);
}

export function hasTokens(creatorId: string): boolean {
  return store.get(creatorId) !== undefined;
}
