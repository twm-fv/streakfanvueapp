import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { config } from '../config.js';

/**
 * AES-256-GCM at rest for creator OAuth tokens. The key lives in env config only.
 * Without a key the process refuses to persist tokens rather than writing plaintext.
 */
function key(): Buffer {
  if (config.TOKEN_ENCRYPTION_KEY === '') {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY is not set. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }
  const buf = Buffer.from(config.TOKEN_ENCRYPTION_KEY, 'base64');
  if (buf.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must decode to 32 bytes');
  return buf;
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), body.toString('base64')].join('.');
}

export function decrypt(payload: string): string {
  const [iv, tag, body] = payload.split('.');
  if (!iv || !tag || !body) throw new Error('malformed ciphertext');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8');
}
