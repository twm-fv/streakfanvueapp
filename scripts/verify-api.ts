/**
 * Step 1 of the plan: verify the Fanvue media contracts before any prototype work leans
 * on them. Read-only by default; pass --upload to also exercise the upload-session flow.
 *
 * Usage:
 *   FANVUE_DEV_ACCESS_TOKEN=... npm run verify:api -- [--upload] [--ttl-probe-minutes 20]
 *
 * Use a dev/test account token only. The token is read from env, never a flag, so it does
 * not land in shell history, and nothing here logs the token or a signed URL.
 */
import { writeFileSync } from 'node:fs';
import { config } from '../src/config.js';
import { endpoints } from '../src/fanvue/endpoints.js';

const args = process.argv.slice(2);
const wantUpload = args.includes('--upload');
const ttlProbeMinutes = Number(args[args.indexOf('--ttl-probe-minutes') + 1]) || 0;

const token = config.FANVUE_DEV_ACCESS_TOKEN;
if (token === '') {
  console.error('FANVUE_DEV_ACCESS_TOKEN is not set. Get a token for a dev account and export it.');
  process.exit(1);
}

const findings: string[] = [];
function record(line: string): void {
  findings.push(line);
  console.log(line);
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${config.FANVUE_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'X-Fanvue-API-Version': config.FANVUE_API_VERSION,
      accept: 'application/json',
      ...init.headers,
    },
  });
}

function rateLimitHeaders(response: Response): string {
  const interesting = [...response.headers.keys()].filter((key) => key.includes('ratelimit') || key.includes('retry'));
  return interesting.length === 0
    ? 'none advertised'
    : interesting.map((key) => `${key}=${response.headers.get(key)}`).join(', ');
}

async function main(): Promise<void> {
  record(`## Fanvue API verification — ${new Date().toISOString()}`);
  record(`Base: ${config.FANVUE_API_BASE_URL}, version header: ${config.FANVUE_API_VERSION}`);

  // 1. List media.
  const list = await call(endpoints.listMedia);
  record(`\n### GET ${endpoints.listMedia}\nstatus ${list.status}; rate limit: ${rateLimitHeaders(list)}`);
  if (!list.ok) {
    record(`body: ${(await list.text()).slice(0, 300)}`);
    return finish(1);
  }
  const listBody = (await list.json()) as { data?: unknown[] } | unknown[];
  const items = (Array.isArray(listBody) ? listBody : (listBody.data ?? [])) as Array<Record<string, unknown>>;
  record(`items returned: ${items.length}; envelope: ${Array.isArray(listBody) ? 'bare array' : 'data[]'}`);

  const video = items.find((item) => {
    const type = String(item.type ?? item.mimeType ?? '').toLowerCase();
    return type.includes('video');
  });
  if (!video) {
    record('no video in the dev account; upload one and re-run');
    return finish(1);
  }
  const uuid = String(video.uuid);

  // 2. Variants and signed URL behaviour.
  const detailPath = endpoints.media(uuid, 'main,thumbnail');
  const detail = await call(detailPath);
  record(`\n### GET /media/{uuid}?variants=main,thumbnail\nstatus ${detail.status}; rate limit: ${rateLimitHeaders(detail)}`);
  const media = (await detail.json()) as {
    tags?: { isNsfw?: boolean; categories?: string[] };
    variants?: Array<{ type: string; url: string; width?: number; height?: number; lengthMs?: number; sizeBytes?: number }>;
  };
  const main = media.variants?.find((variant) => variant.type === 'main');
  if (!main) {
    record('no "main" variant on this video');
    return finish(1);
  }
  record(
    `main variant: ${main.width ?? '?'}x${main.height ?? '?'}, lengthMs=${main.lengthMs ?? '?'}, sizeBytes=${main.sizeBytes ?? '?'}`,
  );

  // 3. Tags, for the SFW export gate.
  record(
    `\n### AI tags\nisNsfw=${media.tags?.isNsfw ?? 'absent'}; categories=${(media.tags?.categories ?? []).join('|') || 'absent'}`,
  );

  // 4. Signed URL: range support, transcode vs original, expiry.
  const head = await fetch(main.url, { method: 'HEAD' });
  record(
    `\n### Signed URL\nHEAD ${head.status}; accept-ranges=${head.headers.get('accept-ranges') ?? 'absent'}; content-length=${head.headers.get('content-length') ?? 'absent'}; content-type=${head.headers.get('content-type') ?? 'absent'}`,
  );
  const ranged = await fetch(main.url, { headers: { range: 'bytes=0-1023' } });
  record(`GET with Range: status ${ranged.status} (206 means resume works); content-range=${ranged.headers.get('content-range') ?? 'absent'}`);
  await ranged.arrayBuffer();

  const expiry = new URL(main.url).searchParams;
  const expiryHint = ['X-Amz-Expires', 'Expires', 'exp', 'st', 'se'].find((key) => expiry.has(key));
  record(
    `TTL hint in URL: ${expiryHint ? `${expiryHint}=${expiry.get(expiryHint)}` : 'not visible in query string'}`,
  );
  record(
    `transcode check: compare content-length (${head.headers.get('content-length') ?? '?'}) and ${main.width ?? '?'}x${main.height ?? '?'} against the source file to tell original from transcode`,
  );

  if (ttlProbeMinutes > 0) {
    record(`\nwaiting ${ttlProbeMinutes} minutes to re-check the same signed URL...`);
    await new Promise((resolve) => setTimeout(resolve, ttlProbeMinutes * 60_000));
    const again = await fetch(main.url, { method: 'HEAD' });
    record(`after ${ttlProbeMinutes} minutes: HEAD ${again.status} (403/401 means the URL expired inside that window)`);
  }

  // 5. Upload session round trip.
  if (wantUpload) {
    const create = await call(endpoints.createUploadSession, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fileName: 'showreel-verify.mp4', mimeType: 'video/mp4' }),
    });
    record(`\n### POST ${endpoints.createUploadSession}\nstatus ${create.status}`);
    const session = (await create.json()) as { uuid?: string; id?: string; uploadUrl?: string; url?: string };
    record(`session keys: ${Object.keys(session).join(', ') || 'none'}`);
    const sessionId = session.uuid ?? session.id;
    const uploadUrl = session.uploadUrl ?? session.url;
    if (sessionId && uploadUrl) {
      const bytes = new Uint8Array(await (await fetch(main.url, { headers: { range: 'bytes=0-65535' } })).arrayBuffer());
      const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'content-type': 'video/mp4' }, body: bytes });
      record(`PUT to upload URL: status ${put.status}`);
      const complete = await call(endpoints.completeUploadSession(sessionId), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      record(`POST complete-upload-session: status ${complete.status}`);
    } else {
      record('create-upload-session did not return an id and upload URL: check the reference for the real shape');
    }
  } else {
    record('\n### Upload session\nskipped (pass --upload to run it)');
  }

  return finish(0);
}

function finish(code: number): void {
  const out = 'docs/api-verification-run.md';
  writeFileSync(out, `${findings.join('\n')}\n`);
  console.log(`\nwrote ${out}`);
  process.exit(code);
}

await main();
