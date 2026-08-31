import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { config, oauthConfigured } from '../config.js';
import { authorizeUrl, createPkcePair, exchangeCode } from '../fanvue/oauth.js';
import { grantPilotCredits } from '../payments/credits.js';
import { setSession } from './session.js';

interface PendingInstall {
  verifier: string;
  createdAt: number;
}

const pending = new Map<string, PendingInstall>();
const STATE_TTL_MS = 10 * 60_000;

function sweep(): void {
  const cutoff = Date.now() - STATE_TTL_MS;
  for (const [state, entry] of pending) {
    if (entry.createdAt < cutoff) pending.delete(state);
  }
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Step 1 of install: creator lands here from the App Store, we bounce them to consent.
  app.get('/auth/start', async (_request, reply) => {
    if (!oauthConfigured) {
      return reply.code(503).send({
        error: 'oauth_not_configured',
        message: 'Set FANVUE_CLIENT_ID/SECRET and the authorize/token URLs from app registration.',
      });
    }
    sweep();
    const state = randomUUID();
    const { verifier, challenge } = createPkcePair();
    pending.set(state, { verifier, createdAt: Date.now() });
    return reply.redirect(authorizeUrl(state, challenge));
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/auth/callback',
    async (request, reply) => {
      const { code, state, error } = request.query;
      if (error) return reply.code(400).send({ error });
      if (!code || !state) return reply.code(400).send({ error: 'missing_code_or_state' });

      const entry = pending.get(state);
      pending.delete(state);
      if (!entry) return reply.code(400).send({ error: 'unknown_or_expired_state' });

      const { creatorId } = await exchangeCode({ code, verifier: entry.verifier });
      grantPilotCredits(creatorId);
      setSession(reply, creatorId);
      return reply.redirect(`${config.PUBLIC_BASE_URL}/`);
    },
  );
}
