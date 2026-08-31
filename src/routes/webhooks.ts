import type { FastifyInstance } from 'fastify';
import { verifyWebhookSignature, isHandledEvent } from '../fanvue/webhooks.js';
import { addMinutes } from '../payments/credits.js';
import { markPurchase, getPurchaseRequest } from '../payments/purchase.js';
import { forgetCreator } from '../store/tokens.js';

interface WebhookBody {
  type?: string;
  data?: { purchaseRequestId?: string; creatorId?: string; [key: string]: unknown };
}

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.post('/webhooks/fanvue', async (request, reply) => {
    const raw = typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {});
    const verdict = verifyWebhookSignature({
      rawBody: raw,
      signature: request.headers['x-fanvue-signature'] as string | undefined,
      timestamp: request.headers['x-fanvue-timestamp'] as string | undefined,
    });
    if (!verdict.ok) {
      request.log.warn({ reason: verdict.reason }, 'rejected webhook');
      return reply.code(401).send({ error: 'invalid_signature' });
    }

    const body = (typeof request.body === 'string' ? JSON.parse(request.body) : request.body) as WebhookBody;
    const type = body.type ?? '';
    if (!isHandledEvent(type)) {
      request.log.info({ type }, 'ignoring unhandled webhook type');
      return reply.send({ ok: true, ignored: true });
    }

    switch (type) {
      case 'payment.success':
      case 'subscription.success': {
        const purchaseId = body.data?.purchaseRequestId;
        const purchase = purchaseId ? getPurchaseRequest(purchaseId) : undefined;
        if (purchase && purchase.status === 'pending') {
          markPurchase(purchase.id, 'paid');
          addMinutes(purchase.creatorId, purchase.minutes);
        }
        break;
      }
      case 'payment.failed':
      case 'subscription.failed': {
        const purchaseId = body.data?.purchaseRequestId;
        if (purchaseId) markPurchase(purchaseId, 'failed');
        break;
      }
      case 'app.uninstalled': {
        // Tokens are already revoked platform-side; drop our copy too.
        const creatorId = body.data?.creatorId;
        if (creatorId) forgetCreator(creatorId);
        break;
      }
      case 'subscription.expiring':
      case 'subscription.ended':
        request.log.info({ type }, 'subscription lifecycle event recorded');
        break;
    }

    return reply.send({ ok: true });
  });
}
