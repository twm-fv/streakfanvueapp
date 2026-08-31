import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import { config } from '../config.js';
import type { ClipRequest, ClippingEngine, RenderedClip } from './engine.js';
import type { AspectRatio } from '../store/jobs.js';

interface OpusProject {
  id: string;
  status: string;
  clips?: Array<{ title?: string; url?: string; durationMs?: number; aspectRatio?: string }>;
}

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 20 * 60_000;

/**
 * OpusClip adapter. The request/response shapes below follow the published OpusClip API
 * and are the first thing to re-check when a render fails: they are not covered by the
 * Fanvue-side verification script.
 */
export class OpusClipEngine implements ClippingEngine {
  readonly name = 'opusclip';

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (config.OPUSCLIP_API_KEY === '') throw new Error('OPUSCLIP_API_KEY is not set');
    const response = await fetch(`${config.OPUSCLIP_API_BASE_URL}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${config.OPUSCLIP_API_KEY}`,
        'content-type': 'application/json',
        ...init.headers,
      },
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`OpusClip ${response.status} on ${path}: ${text.slice(0, 300)}`);
    return JSON.parse(text) as T;
  }

  async render(request: ClipRequest): Promise<RenderedClip[]> {
    if (!request.sourceUrl) {
      throw new Error('OpusClip renders from a source URL; none was supplied');
    }

    const project = await this.call<OpusProject>('/v1/projects', {
      method: 'POST',
      body: JSON.stringify({
        videoUrl: request.sourceUrl,
        aspectRatios: request.aspectRatios,
        captions: request.captions,
        preset: request.preset,
      }),
    });

    const finished = await this.poll(project.id);
    const outDir = join(config.WORK_DIR, 'renders', project.id);
    await mkdir(outDir, { recursive: true });

    const clips: RenderedClip[] = [];
    for (const [index, clip] of (finished.clips ?? []).entries()) {
      if (!clip.url) continue;
      const path = join(outDir, `clip-${index + 1}.mp4`);
      const download = await fetch(clip.url);
      if (!download.ok || !download.body) throw new Error(`clip download failed with ${download.status}`);
      await pipeline(
        Readable.fromWeb(download.body as Parameters<typeof Readable.fromWeb>[0]),
        createWriteStream(path),
      );
      clips.push({
        title: clip.title ?? `clip ${index + 1}`,
        aspectRatio: (clip.aspectRatio as AspectRatio) ?? request.aspectRatios[0] ?? '9:16',
        durationMs: clip.durationMs ?? 0,
        path,
        mimeType: 'video/mp4',
      });
    }
    if (clips.length === 0) throw new Error('OpusClip returned no clips');
    return clips;
  }

  private async poll(projectId: string): Promise<OpusProject> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const project = await this.call<OpusProject>(`/v1/projects/${projectId}`);
      if (project.status === 'completed' || project.status === 'succeeded') return project;
      if (project.status === 'failed') throw new Error(`OpusClip project ${projectId} failed`);
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    throw new Error(`OpusClip project ${projectId} did not finish within the timeout`);
  }
}
