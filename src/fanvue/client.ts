import { createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { dirname } from 'node:path';
import { config } from '../config.js';
import { endpoints } from './endpoints.js';
import { accessTokenFor } from './oauth.js';
import { forgetCreator } from '../store/tokens.js';
import { FanvueApiError, UnauthorizedError, mediaListSchema, mediaSchema } from './types.js';
import type { Media, MediaVariant } from './types.js';
import { logMediaAccess } from '../safety/accessLog.js';

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export class FanvueClient {
  constructor(private readonly creatorId: string) {}

  private async request<T>(path: string, options: RequestOptions = {}): Promise<{ data: T; headers: Headers }> {
    const token = await accessTokenFor(this.creatorId);
    const response = await fetch(`${config.FANVUE_API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        'X-Fanvue-API-Version': config.FANVUE_API_VERSION,
        accept: 'application/json',
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    if (response.status === 401) {
      // Uninstall or revoked grant: drop the tokens rather than retrying.
      forgetCreator(this.creatorId);
      throw new UnauthorizedError();
    }
    const text = await response.text();
    if (!response.ok) throw new FanvueApiError(response.status, path, text.slice(0, 500));
    return { data: (text === '' ? {} : JSON.parse(text)) as T, headers: response.headers };
  }

  async listMedia(): Promise<Media[]> {
    const { data } = await this.request<unknown>(endpoints.listMedia);
    const parsed = mediaListSchema.safeParse(data);
    // Tolerate a bare array in case the list endpoint is not envelope-wrapped.
    if (!parsed.success) return mediaSchema.array().parse(data);
    return parsed.data.data;
  }

  async getMedia(uuid: string, variants = 'main,thumbnail'): Promise<Media> {
    const { data } = await this.request<unknown>(endpoints.media(uuid, variants));
    const media = mediaSchema.parse(data);
    logMediaAccess({ creatorId: this.creatorId, mediaUuid: uuid, action: 'read-variants' });
    return media;
  }

  /**
   * Streams a signed variant URL to disk. The signed URL is pre-authorised, so it is
   * fetched without the bearer token attached.
   */
  async downloadVariant(variant: MediaVariant, destination: string): Promise<{ bytes: number }> {
    await mkdir(dirname(destination), { recursive: true });
    const response = await fetch(variant.url);
    if (!response.ok || !response.body) {
      throw new Error(`signed URL download failed with ${response.status}`);
    }
    await pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(destination));
    const { size } = await stat(destination);
    return { bytes: size };
  }

  /** Three-step upload: create session, PUT the bytes, complete. Returns the new media uuid. */
  async uploadToVault(input: { filePath: string; fileName: string; mimeType: string }): Promise<string> {
    const { data: session } = await this.request<{ uuid?: string; id?: string; uploadUrl?: string; url?: string }>(
      endpoints.createUploadSession,
      { method: 'POST', body: { fileName: input.fileName, mimeType: input.mimeType } },
    );

    const sessionId = session.uuid ?? session.id;
    const uploadUrl = session.uploadUrl ?? session.url;
    if (!sessionId || !uploadUrl) {
      throw new Error('upload session response did not carry a session id and upload URL');
    }

    const file = await import('node:fs/promises').then((fs) => fs.readFile(input.filePath));
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': input.mimeType },
      body: new Uint8Array(file),
    });
    if (!put.ok) throw new Error(`upload PUT failed with ${put.status}`);

    const { data: completed } = await this.request<{ uuid?: string; mediaUuid?: string }>(
      endpoints.completeUploadSession(sessionId),
      { method: 'POST', body: {} },
    );
    const mediaUuid = completed.mediaUuid ?? completed.uuid ?? sessionId;
    logMediaAccess({ creatorId: this.creatorId, mediaUuid, action: 'upload' });
    return mediaUuid;
  }
}

/** Source downloads are scratch data: remove them as soon as the render job is finished. */
export async function discardScratch(path: string): Promise<void> {
  await rm(path, { force: true, recursive: true });
}

export function pickMainVideoVariant(media: Media): MediaVariant | undefined {
  return media.variants?.find((variant) => variant.type === 'main');
}
