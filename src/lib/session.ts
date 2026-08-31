import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/env";
import { cookieKey, decrypt, encrypt, randomId } from "@/lib/crypto";
import { getStore, type StoredSession } from "@/lib/store";
import { refreshAccessToken, revokeToken } from "@/lib/oauth";
import type { TokenResponse } from "@/lib/oauth";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

/**
 * The browser cookie carries an opaque session id and nothing else. Access and
 * refresh tokens live server side, encrypted at rest. A stolen cookie is
 * therefore useless once the session row is deleted, and the cookie itself
 * never exposes a Fanvue token.
 */
type CookiePayload = { sid: string };

export async function issueSessionCookie(sid: string) {
  const jwt = await new SignJWT({ sid } satisfies CookiePayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(cookieKey());

  const cookieStore = await cookies();
  cookieStore.set(env.SESSION_COOKIE_NAME, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

async function readSid(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(env.SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, cookieKey());
    const sid = (payload as CookiePayload).sid;
    return typeof sid === "string" && sid.length > 0 ? sid : null;
  } catch {
    return null;
  }
}

export async function createSession(userId: string, token: TokenResponse): Promise<string> {
  const sid = randomId();
  await getStore().putSession({
    sid,
    userId,
    accessToken: encrypt(token.access_token),
    refreshToken: token.refresh_token ? encrypt(token.refresh_token) : null,
    expiresAt: Date.now() + token.expires_in * 1000,
    scope: token.scope ?? "",
    createdAt: new Date().toISOString(),
  });
  await issueSessionCookie(sid);
  return sid;
}

export type ActiveSession = {
  sid: string;
  userId: string;
  accessToken: string;
  scope: string;
};

/**
 * Returns a session with a live access token, refreshing it first if it is
 * within 60s of expiry. Returns null when there is no usable session, which
 * callers treat as "not connected" rather than as an error.
 */
export async function getActiveSession(): Promise<ActiveSession | null> {
  const sid = await readSid();
  if (!sid) return null;

  const store = getStore();
  let stored = await store.getSession(sid);
  if (!stored) return null;

  if (Date.now() >= stored.expiresAt - 60_000) {
    if (!stored.refreshToken) return null;
    try {
      const refreshed = await refreshAccessToken(decrypt(stored.refreshToken));
      stored = {
        ...stored,
        accessToken: encrypt(refreshed.access_token),
        refreshToken: refreshed.refresh_token
          ? encrypt(refreshed.refresh_token)
          : stored.refreshToken,
        expiresAt: Date.now() + refreshed.expires_in * 1000,
        scope: refreshed.scope ?? stored.scope,
      } satisfies StoredSession;
      await store.putSession(stored);
    } catch {
      // Refresh token rejected or revoked upstream: drop the dead session.
      await store.deleteSession(sid);
      return null;
    }
  }

  return {
    sid,
    userId: stored.userId,
    accessToken: decrypt(stored.accessToken),
    scope: stored.scope,
  };
}

/** Clears the cookie, deletes the server-side session, and revokes upstream. */
export async function endSession() {
  const sid = await readSid();
  const cookieStore = await cookies();
  cookieStore.delete(env.SESSION_COOKIE_NAME);
  if (!sid) return;

  const store = getStore();
  const stored = await store.getSession(sid);
  await store.deleteSession(sid);

  if (stored?.refreshToken) {
    await revokeToken(decrypt(stored.refreshToken), "refresh_token");
  }
}
