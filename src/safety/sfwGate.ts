import type { Media } from '../fanvue/types.js';
import { logMediaAccess } from './accessLog.js';

/** Categories that keep a clip out of TikTok/IG/YT export even when isNsfw is false. */
const BLOCKED_CATEGORIES = ['nudity', 'sexual', 'explicit', 'lingerie', 'suggestive'];

export interface SfwVerdict {
  socialExportAllowed: boolean;
  reason?: string;
}

/**
 * Social export gate built on the media object's existing AI tags rather than new
 * moderation. Missing tags are treated as "not cleared": a clip can always be kept in
 * the Vault, it just does not get a one-click path to a mainstream network.
 */
export function evaluateSocialExport(media: Media): SfwVerdict {
  const tags = media.tags;
  if (!tags || tags.isNsfw === undefined) {
    return { socialExportAllowed: false, reason: 'no AI tags on the source media, export not cleared' };
  }
  if (tags.isNsfw) {
    return { socialExportAllowed: false, reason: 'source media is tagged NSFW' };
  }
  const hit = (tags.categories ?? []).find((category) =>
    BLOCKED_CATEGORIES.some((blocked) => category.toLowerCase().includes(blocked)),
  );
  if (hit) {
    return { socialExportAllowed: false, reason: `source media carries the "${hit}" category` };
  }
  return { socialExportAllowed: true };
}

export function recordBlockedExport(creatorId: string, mediaUuid: string, reason: string): void {
  logMediaAccess({ creatorId, mediaUuid, action: 'export-blocked', note: reason });
}
