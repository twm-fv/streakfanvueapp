import { strict as assert } from 'node:assert';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';

process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');
const { encrypt, decrypt } = await import('../src/store/crypto.js');

test('round-trips a token and does not store it in the clear', () => {
  const token = 'fv_access_token_example';
  const sealed = encrypt(token);
  assert.ok(!sealed.includes(token));
  assert.equal(decrypt(sealed), token);
});

test('rejects a tampered ciphertext', () => {
  const sealed = encrypt('secret');
  const [iv, tag, body] = sealed.split('.');
  const flipped = `${iv}.${tag}.${Buffer.from('tampered').toString('base64')}`;
  assert.throws(() => decrypt(flipped));
  assert.equal(decrypt(`${iv}.${tag}.${body}`), 'secret');
});
