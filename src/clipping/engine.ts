import type { AspectRatio, ClipPreset } from '../store/jobs.js';

export interface ClipRequest {
  sourcePath: string;
  sourceUrl?: string;
  preset: ClipPreset;
  aspectRatios: AspectRatio[];
  durationMs: number;
  captions: boolean;
}

export interface RenderedClip {
  title: string;
  aspectRatio: AspectRatio;
  durationMs: number;
  /** Local path to the rendered file, ready to be pushed back into the Vault. */
  path: string;
  mimeType: string;
}

/**
 * The clipping engine is a swappable dependency: we never build clipping tech.
 * OpusClip is the default engine, Klap/Vizard would slot in behind the same interface.
 */
export interface ClippingEngine {
  readonly name: string;
  render(request: ClipRequest): Promise<RenderedClip[]>;
}
