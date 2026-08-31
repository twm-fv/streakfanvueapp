import { join } from 'node:path';
import { config } from '../config.js';
import { FanvueClient, discardScratch, pickMainVideoVariant } from '../fanvue/client.js';
import { selectEngine } from './index.js';
import { createJob, updateJob } from '../store/jobs.js';
import type { AspectRatio, ClipPreset, ClipResult, Job } from '../store/jobs.js';
import { chargeMinutes, minutesForSource } from '../payments/credits.js';
import { evaluateSocialExport, recordBlockedExport } from '../safety/sfwGate.js';
import { logMediaAccess } from '../safety/accessLog.js';

export interface RenderInput {
  creatorId: string;
  sourceMediaUuid: string;
  preset: ClipPreset;
  aspectRatios: AspectRatio[];
  captions: boolean;
}

/**
 * Vault video in, clips back in the Vault out.
 *
 * Source bytes are scratch: they live under WORK_DIR for the length of the render and are
 * deleted in the finally block whether the job succeeds or fails.
 */
export async function runRender(input: RenderInput): Promise<Job> {
  const client = new FanvueClient(input.creatorId);
  const media = await client.getMedia(input.sourceMediaUuid, 'main');
  const variant = pickMainVideoVariant(media);
  if (!variant) throw new Error(`media ${input.sourceMediaUuid} has no main variant to clip`);

  const durationMs = variant.lengthMs ?? 0;
  const minutes = minutesForSource(durationMs);
  chargeMinutes(input.creatorId, minutes);

  const job = createJob({
    creatorId: input.creatorId,
    sourceMediaUuid: input.sourceMediaUuid,
    preset: input.preset,
    aspectRatios: input.aspectRatios,
    minutesCharged: minutes,
  });

  const scratchDir = join(config.WORK_DIR, 'sources', job.id);
  const sourcePath = join(scratchDir, 'source.mp4');

  try {
    updateJob(job.id, { status: 'downloading' });
    await client.downloadVariant(variant, sourcePath);
    logMediaAccess({ creatorId: input.creatorId, mediaUuid: input.sourceMediaUuid, action: 'download' });

    updateJob(job.id, { status: 'clipping' });
    const rendered = await selectEngine().render({
      sourcePath,
      sourceUrl: variant.url,
      preset: input.preset,
      aspectRatios: input.aspectRatios,
      durationMs,
      captions: input.captions,
    });

    const verdict = evaluateSocialExport(media);
    if (!verdict.socialExportAllowed && verdict.reason) {
      recordBlockedExport(input.creatorId, input.sourceMediaUuid, verdict.reason);
    }

    updateJob(job.id, { status: 'uploading' });
    const clips: ClipResult[] = [];
    for (const [index, clip] of rendered.entries()) {
      const mediaUuid = await client.uploadToVault({
        filePath: clip.path,
        fileName: `${input.preset}-${index + 1}.mp4`,
        mimeType: clip.mimeType,
      });
      clips.push({
        clipId: `${job.id}-${index + 1}`,
        title: clip.title,
        aspectRatio: clip.aspectRatio,
        durationMs: clip.durationMs,
        mediaUuid,
        socialExportAllowed: verdict.socialExportAllowed,
      });
      await discardScratch(clip.path);
    }

    return updateJob(job.id, { status: 'done', clips });
  } catch (error) {
    return updateJob(job.id, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    // Creator media never outlives the render job.
    await discardScratch(scratchDir);
  }
}
