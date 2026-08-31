import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "crypto";
import { env } from "@/env";

/**
 * Two independent keys are derived from SESSION_SECRET via HKDF so that the
 * cookie-signing key and the at-rest encryption key never share material.
 */
function derive(info: string): Buffer {
  return Buffer.from(
    hkdfSync("sha256", Buffer.from(env.SESSION_SECRET, "utf8"), Buffer.alloc(0), info, 32),
  );
}

let cookieKeyCache: Uint8Array | null = null;
let dataKeyCache: Buffer | null = null;

/** HS256 key for the opaque session cookie. */
export function cookieKey(): Uint8Array {
  if (!cookieKeyCache) cookieKeyCache = new Uint8Array(derive("streak:cookie:v1"));
  return cookieKeyCache;
}

function dataKey(): Buffer {
  if (!dataKeyCache) dataKeyCache = derive("streak:data:v1");
  return dataKeyCache;
}

/**
 * AES-256-GCM. Used for OAuth access/refresh tokens at rest so that a leaked
 * store file does not hand an attacker live Fanvue credentials.
 */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dataKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

export function decrypt(payload: string): string {
  const [version, iv, tag, data] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !data) {
    throw new Error("Malformed ciphertext");
  }
  const decipher = createDecipheriv("aes-256-gcm", dataKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function randomId(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
