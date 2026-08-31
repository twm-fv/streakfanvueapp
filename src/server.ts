import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import fastifyStatic from '@fastify/static';
import { config, oauthConfigured } from './config.js';
import { authRoutes } from './routes/auth.js';
import { mediaRoutes } from './routes/media.js';
import { clipRoutes } from './routes/clips.js';
import { paymentRoutes } from './routes/payments.js';
import { webhookRoutes } from './routes/webhooks.js';
import { creatorFromRequest } from './routes/session.js';
import { hasTokens } from './store/tokens.js';
import { config as appConfig } from './config.js';

const here = dirname(fileURLToPath(import.meta.url));

export async function buildServer() {
  const app = Fastify({ logger: { level: config.LOG_LEVEL } });

  await app.register(cookie, {
    // A rotating secret logs every creator out on restart; set one in env for real runs.
    secret: process.env.COOKIE_SECRET ?? randomBytes(32).toString('hex'),
  });
  await app.register(formbody);

  app.addHook('onSend', async (_request, reply, payload) => {
    // The app is meant to be framed by Fanvue, so no X-Frame-Options: DENY here.
    // frame-ancestors is the allowlist; tighten it to the exact parent origins at registration.
    reply.header('content-security-policy', "default-src 'self'; frame-ancestors https://*.fanvue.com; img-src 'self' data:; style-src 'self' 'unsafe-inline'");
    reply.header('referrer-policy', 'strict-origin-when-cross-origin');
    reply.header('x-content-type-options', 'nosniff');
    return payload;
  });

  await app.register(fastifyStatic, { root: join(here, '..', 'public'), prefix: '/' });

  app.get('/healthz', async () => ({ ok: true }));

  app.get('/api/session', async (request) => {
    const creatorId = creatorFromRequest(request);
    return {
      installed: creatorId !== undefined && hasTokens(creatorId),
      oauthConfigured,
      paymentsEnabled: appConfig.PAYMENTS_ENABLED,
      engine: appConfig.CLIPPING_ENGINE,
    };
  });

  await app.register(authRoutes);
  await app.register(mediaRoutes);
  await app.register(clipRoutes);
  await app.register(paymentRoutes);
  await app.register(webhookRoutes);

  return app;
}

const isEntryPoint = process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (isEntryPoint) {
  const app = await buildServer();
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
}
