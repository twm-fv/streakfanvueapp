import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';

export interface MediaAccessEntry {
  creatorId: string;
  mediaUuid: string;
  action: 'read-variants' | 'download' | 'upload' | 'export-blocked';
  note?: string;
}

/**
 * Append-only record of every creator media touch. Ids only: no URLs, no filenames,
 * no creator-identifying detail beyond the opaque creator id.
 */
export function logMediaAccess(entry: MediaAccessEntry): void {
  mkdirSync(config.DATA_DIR, { recursive: true });
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry });
  appendFileSync(join(config.DATA_DIR, 'media-access.log'), `${line}\n`, { mode: 0o600 });
}
