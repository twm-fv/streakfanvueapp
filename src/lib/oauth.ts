import { createHash, randomBytes } from "crypto";
import { env, requireOAuthConfig } from "@/env";

function base64url(input: Buffer) {
  return input.toString("base64url");
}

export function generatePkce() {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge, method: "S256" as const };
}

/** Required by Fanvue's authorisation server. Do not remove. */
const DEFAULT_SCOPES = "openid offline_access offline";

/** The scopes Streak asks for, as one deduplicated space-separated string. */
export function requestedScopes(): string {
  const all = `${DEFAULT_SCOPES} ${env.OAUTH_SCOPES}`.split(/\s+/).filter(Boolean);
  return Array.from(new Set(all)).join(" ");
}

export function getAuthorizeUrl({
  state,
  codeChallenge,
}: {
  state: string;
  codeChallenge: string;
}) {
  const cfg = requireOAuthConfig();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: requestedScopes(),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "login",
  });
  return `${cfg.issuerBaseURL}/oauth2/auth?${params.toString()}`;
}

export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  id_token?: string;
};

async function tokenRequest(params: URLSearchParams): Promise<TokenResponse> {
  const cfg = requireOAuthConfig();
  const res = await fetch(`${cfg.issuerBaseURL}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " + Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64"),
    },
    body: params.toString(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    // Deliberately does not echo the response body: it can contain token material.
    throw new Error(`Token endpoint returned ${res.status}`);
  }
  return (await res.json()) as TokenResponse;
}

export function exchangeCodeForToken({
  code,
  codeVerifier,
}: {
  code: string;
  codeVerifier: string;
}) {
  const cfg = requireOAuthConfig();
  return tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: cfg.redirectUri,
      client_id: cfg.clientId,
      code_verifier: codeVerifier,
    }),
  );
}

export function refreshAccessToken(refreshToken: string) {
  const cfg = requireOAuthConfig();
  return tokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: cfg.clientId,
    }),
  );
}

/**
 * Best effort token revocation on disconnect. A creator who disconnects should
 * not leave a usable token behind, but a revocation failure must not block the
 * local session teardown that follows it.
 */
export async function revokeToken(token: string, hint: "access_token" | "refresh_token") {
  const cfg = requireOAuthConfig();
  try {
    await fetch(`${cfg.issuerBaseURL}/oauth2/revoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " + Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64"),
      },
      body: new URLSearchParams({ token, token_type_hint: hint }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Swallowed on purpose - see doc comment.
  }
}
