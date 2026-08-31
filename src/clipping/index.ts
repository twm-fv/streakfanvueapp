import { config } from '../config.js';
import type { ClippingEngine } from './engine.js';
import { MockEngine } from './mockEngine.js';
import { OpusClipEngine } from './opusClipEngine.js';

export function selectEngine(): ClippingEngine {
  return config.CLIPPING_ENGINE === 'opusclip' ? new OpusClipEngine() : new MockEngine();
}
