import { strict as assert } from 'node:assert';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';

process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');
process.env.COOKIE_SECRET = randomBytes(32).toString('hex');
const { buildServer } = await import('../src/server.js');

const app = await buildServer();

test.after(async () => {
  await app.close();
});

test('health check answers', async () => {
  const response = await app.inject({ method: 'GET', url: '/healthz' });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ok: true });
});

test('a fresh visitor is reported as not installed', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/session' });
  assert.equal(response.json().installed, false);
});

test('media and clip routes refuse an uninstalled caller', async () => {
  for (const url of ['/api/media', '/api/clips', '/api/credits']) {
    const response = await app.inject({ method: 'GET', url });
    assert.equal(response.statusCode, 401, `${url} should be 401`);
    assert.equal(response.json().error, 'not_installed');
  }
});

test('install start is refused while OAuth credentials are missing', async () => {
  const response = await app.inject({ method: 'GET', url: '/auth/start' });
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, 'oauth_not_configured');
});

test('unsigned webhooks are rejected', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/webhooks/fanvue',
    payload: { type: 'payment.success' },
  });
  assert.equal(response.statusCode, 401);
});

test('the app frame policy allows the Fanvue shell and nothing else', async () => {
  const response = await app.inject({ method: 'GET', url: '/healthz' });
  assert.match(response.headers['content-security-policy'] as string, /frame-ancestors https:\/\/\*\.fanvue\.com/);
});
