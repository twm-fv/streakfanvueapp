import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { balanceFor, creditPack } from '../payments/credits.js';
import { createPurchaseRequest } from '../payments/purchase.js';
import { requireCreator } from './session.js';

export async function paymentRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Backend half of the payment flow. The frontend takes the returned request and asks
   * the parent Fanvue window to open the native payment modal over postMessage; the
   * result comes back to us as a webhook, never from the iframe.
   */
  app.post('/api/purchase', async (request, reply) => {
    const creatorId = requireCreator(request, reply);
    if (!creatorId) return;

    const purchase = await createPurchaseRequest(creatorId);
    return reply.send({
      purchase,
      pack: creditPack,
      paymentsEnabled: config.PAYMENTS_ENABLED,
      creditMinutes: balanceFor(creatorId),
    });
  });

  app.get('/api/credits', async (request, reply) => {
    const creatorId = requireCreator(request, reply);
    if (!creatorId) return;
    return reply.send({ creditMinutes: balanceFor(creatorId), pack: creditPack });
  });
}
