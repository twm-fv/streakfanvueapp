import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { runRender } from '../clipping/pipeline.js';
import { getJob, listJobs } from '../store/jobs.js';
import { InsufficientCreditsError, balanceFor } from '../payments/credits.js';
import { UnauthorizedError } from '../fanvue/types.js';
import { clearSession, requireCreator } from './session.js';

const renderBody = z.object({
  mediaUuid: z.string().min(1),
  preset: z.enum(['showreel', 'social', 'recap']).default('showreel'),
  aspectRatios: z.array(z.enum(['9:16', '1:1', '16:9'])).min(1).default(['9:16']),
  captions: z.boolean().default(true),
});

export async function clipRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/clips', async (request, reply) => {
    const creatorId = requireCreator(request, reply);
    if (!creatorId) return;

    const parsed = renderBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    try {
      const job = await runRender({
        creatorId,
        sourceMediaUuid: parsed.data.mediaUuid,
        preset: parsed.data.preset,
        aspectRatios: parsed.data.aspectRatios,
        captions: parsed.data.captions,
      });
      return reply.send({ job, creditMinutes: balanceFor(creatorId) });
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        return reply.code(402).send({
          error: 'insufficient_credits',
          required: error.required,
          available: error.available,
        });
      }
      if (error instanceof UnauthorizedError) {
        clearSession(reply);
        return reply.code(401).send({ error: 'not_installed' });
      }
      throw error;
    }
  });

  app.get('/api/clips', async (request, reply) => {
    const creatorId = requireCreator(request, reply);
    if (!creatorId) return;
    return reply.send({ jobs: listJobs(creatorId) });
  });

  app.get<{ Params: { id: string } }>('/api/clips/:id', async (request, reply) => {
    const creatorId = requireCreator(request, reply);
    if (!creatorId) return;
    const job = getJob(request.params.id);
    if (!job || job.creatorId !== creatorId) return reply.code(404).send({ error: 'not_found' });
    return reply.send({ job });
  });
}
