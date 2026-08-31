import { createHash, randomBytes } from 'node:crypto';
import { config, oauthConfigured, redirectUri } from '../config.js';
import { tokenResponseSchema } from './types.js';
import { saveTokens, readTokens } from '../store/tokens.js';

export interface PkcePair {
  verifier: string;
  challenge: string;
}

export function createPkcePair(): PkcePair {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function authorizeUrl(state: string, challenge: string): string {
  if (!oauthConfigured) throw new Error('OAuth is not configured; see .env.example');
  const url = new URL(config.FANVUE_AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.FANVUE_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', config.FANVUE_SCOPES);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

async function postToken(body: Record<string, string>): Promise<ReturnType<typeof tokenResponseSchema.parse>> {
  const response = await fetch(config.FANVUE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      // Confidential client: the secret never leaves the backend.
      authorization: `Basic ${Buffer.from(`${config.FANVUE_CLIENT_ID}:${config.FANVUE_CLIENT_SECRET}`).toString('base64')}`,
    },
    body: new URLSearchParams(body).toString(),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`token endpoint ${response.status}: ${text.slice(0, 200)}`);
  return tokenResponseSchema.parse(JSON.parse(text));
}

/**
 * Reads the `sub` claim so a creator who reinstalls keeps their credit balance.
 * The claim is decoded, not verified: before the pilot, either verify the id_token
 * signature against the Fanvue JWKS or call the userinfo endpoint instead.
 */
function subjectFromIdToken(idToken: string | undefined): string | undefined {
  if (!idToken) return undefined;
  const payload = idToken.split('.')[1];
  if (!payload) return undefined;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: string };
    return claims.sub;
  } catch {
    return undefined;
  }
}

export async function exchangeCode(input: { code: string; verifier: string }): Promise<{ creatorId: string }> {
  const tokens = await postToken({
    grant_type: 'authorization_code',
    code: input.code,
    redirect_uri: redirectUri,
    client_id: config.FANVUE_CLIENT_ID,
    code_verifier: input.verifier,
  });
  const creatorId = subjectFromIdToken(tokens.id_token) ?? randomBytes(16).toString('hex');
  saveTokens({
    creatorId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
    scope: tokens.scope,
  });
  return { creatorId };
}

/**
 * Returns a valid access token for the creator, refreshing silently when it is close to
 * expiry so returning creators never see a second consent screen.
 */
export async function accessTokenFor(creatorId: string): Promise<string> {
  const current = readTokens(creatorId);
  if (!current) throw new Error(`no Fanvue grant stored for creator ${creatorId}`);
  const stillFresh = current.expiresAt - Date.now() > 60_000;
  if (stillFresh) return current.accessToken;

  const refreshed = await postToken({
    grant_type: 'refresh_token',
    refresh_token: current.refreshToken,
    client_id: config.FANVUE_CLIENT_ID,
  });
  saveTokens({
    creatorId,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token === '' ? current.refreshToken : refreshed.refresh_token,
    expiresIn: refreshed.expires_in,
    scope: refreshed.scope === '' ? current.scope : refreshed.scope,
  });
  return refreshed.access_token;
}
