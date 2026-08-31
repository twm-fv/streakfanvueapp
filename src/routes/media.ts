import type { FastifyInstance } from 'fastify';
import { FanvueClient, pickMainVideoVariant } from '../fanvue/client.js';
import { UnauthorizedError } from '../fanvue/types.js';
import { evaluateSocialExport } from '../safety/sfwGate.js';
import { balanceFor, minutesForSource } from '../payments/credits.js';
import { clearSession, requireCreator } from './session.js';

export async function mediaRoutes(app: FastifyInstance): Promise<void> {
  // The media browser: videos only, with the cost and export verdict resolved up front.
  app.get('/api/media', async (request, reply) => {
    const creatorId = requireCreator(request, reply);
    if (!creatorId) return;

    try {
      const media = await new FanvueClient(creatorId).listMedia();
      const videos = media
        .filter((item) => (item.type ?? '').toLowerCase().includes('video') || (item.mimeType ?? '').startsWith('video/'))
        .map((item) => {
          const variant = pickMainVideoVariant(item);
          const durationMs = variant?.lengthMs ?? 0;
          return {
            uuid: item.uuid,
            durationMs,
            width: variant?.width,
            height: variant?.height,
            estimatedMinutes: minutesForSource(durationMs),
            socialExport: evaluateSocialExport(item),
          };
        });
      return reply.send({ videos, creditMinutes: balanceFor(creatorId) });
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        clearSession(reply);
        return reply.code(401).send({ error: 'not_installed' });
      }
      throw error;
    }
  });
}
