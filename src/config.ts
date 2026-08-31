import { z } from 'zod';
import { readFileSync } from 'node:fs';

// Minimal .env loader so the prototype has no dotenv dependency.
function loadDotEnv(path = '.env'): void {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, value] = match as unknown as [string, string, string];
    if (process.env[key] === undefined) {
      process.env[key] = value.replace(/^['"]|['"]$/g, '');
    }
  }
}

loadDotEnv();

const bool = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .default('false');

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
  LOG_LEVEL: z.string().default('info'),

  FANVUE_CLIENT_ID: z.string().default(''),
  FANVUE_CLIENT_SECRET: z.string().default(''),
  FANVUE_AUTHORIZE_URL: z.string().default(''),
  FANVUE_TOKEN_URL: z.string().default(''),
  FANVUE_API_BASE_URL: z.string().url().default('https://api.fanvue.com'),
  FANVUE_API_VERSION: z.string().default('2025-06-26'),
  FANVUE_SCOPES: z.string().default('openid offline_access read:media write:media'),
  FANVUE_WEBHOOK_SECRET: z.string().default(''),
  FANVUE_DEV_ACCESS_TOKEN: z.string().default(''),

  CLIPPING_ENGINE: z.enum(['mock', 'opusclip']).default('mock'),
  OPUSCLIP_API_BASE_URL: z.string().default('https://api.opus.pro'),
  OPUSCLIP_API_KEY: z.string().default(''),

  PAYMENTS_ENABLED: bool,
  CREDIT_PACK_MINUTES: z.coerce.number().default(30),
  CREDIT_PACK_PRICE_CENTS: z.coerce.number().default(1500),

  TOKEN_ENCRYPTION_KEY: z.string().default(''),
  DATA_DIR: z.string().default('./data'),
  WORK_DIR: z.string().default('./tmp'),
});

export type Config = z.infer<typeof schema>;

export const config: Config = schema.parse(process.env);

export const oauthConfigured =
  config.FANVUE_CLIENT_ID !== '' &&
  config.FANVUE_CLIENT_SECRET !== '' &&
  config.FANVUE_AUTHORIZE_URL !== '' &&
  config.FANVUE_TOKEN_URL !== '';

export const redirectUri = `${config.PUBLIC_BASE_URL}/auth/callback`;
