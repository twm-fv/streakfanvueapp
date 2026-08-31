import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config.js';
import type { ClipRequest, ClippingEngine, RenderedClip } from './engine.js';

const PRESET_CLIP_COUNT: Record<ClipRequest['preset'], number> = {
  showreel: 1,
  social: 3,
  recap: 1,
};

/**
 * Offline engine for local development and tests: copies the source to one file per
 * requested aspect ratio so the full pipeline (download, render, upload, ledger) can be
 * exercised without an OpusClip key or any external call.
 */
export class MockEngine implements ClippingEngine {
  readonly name = 'mock';

  async render(request: ClipRequest): Promise<RenderedClip[]> {
    const outDir = join(config.WORK_DIR, 'mock-renders');
    await mkdir(outDir, { recursive: true });

    const clips: RenderedClip[] = [];
    for (const aspectRatio of request.aspectRatios) {
      for (let index = 0; index < PRESET_CLIP_COUNT[request.preset]; index += 1) {
        const path = join(outDir, `${request.preset}-${aspectRatio.replace(':', 'x')}-${index + 1}.mp4`);
        await copyFile(request.sourcePath, path);
        clips.push({
          title: `${request.preset} clip ${index + 1} (${aspectRatio})`,
          aspectRatio,
          durationMs: Math.min(request.durationMs, 60_000),
          path,
          mimeType: 'video/mp4',
        });
      }
    }
    return clips;
  }
}
