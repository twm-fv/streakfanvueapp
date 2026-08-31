import type { FastifyReply, FastifyRequest } from 'fastify';
import { hasTokens } from '../store/tokens.js';

const COOKIE = 'showreel_session';

/**
 * The app runs cross-site inside the Fanvue iframe, so the session cookie has to be
 * SameSite=None; Secure. Locally over http the browser keeps it because the host is
 * localhost.
 */
export function setSession(reply: FastifyReply, creatorId: string): void {
  reply.setCookie(COOKIE, creatorId, {
    path: '/',
    httpOnly: true,
    signed: true,
    sameSite: 'none',
    secure: true,
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearSession(reply: FastifyReply): void {
  reply.clearCookie(COOKIE, { path: '/' });
}

export function creatorFromRequest(request: FastifyRequest): string | undefined {
  const raw = request.cookies[COOKIE];
  if (!raw) return undefined;
  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return undefined;
  return unsigned.value;
}

/** Resolves the installed creator or replies 401 so the frontend can start the install flow. */
export function requireCreator(request: FastifyRequest, reply: FastifyReply): string | undefined {
  const creatorId = creatorFromRequest(request);
  if (!creatorId || !hasTokens(creatorId)) {
    void reply.code(401).send({ error: 'not_installed' });
    return undefined;
  }
  return creatorId;
}
