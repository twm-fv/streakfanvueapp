import { strict as assert } from 'node:assert';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';

process.env.FANVUE_WEBHOOK_SECRET = 'test-secret';
const { verifyWebhookSignature } = await import('../src/fanvue/webhooks.js');

function sign(body: string, timestamp: string): string {
  return createHmac('sha256', 'test-secret').update(`${timestamp}.${body}`).digest('hex');
}

test('accepts a correctly signed, fresh delivery', () => {
  const body = JSON.stringify({ type: 'payment.success' });
  const timestamp = String(Date.now());
  const result = verifyWebhookSignature({ rawBody: body, signature: sign(body, timestamp), timestamp });
  assert.equal(result.ok, true);
});

test('rejects a tampered body', () => {
  const timestamp = String(Date.now());
  const signature = sign(JSON.stringify({ type: 'payment.success' }), timestamp);
  const result = verifyWebhookSignature({ rawBody: JSON.stringify({ type: 'payment.failed' }), signature, timestamp });
  assert.equal(result.ok, false);
});

test('rejects a replayed delivery outside the tolerance window', () => {
  const body = JSON.stringify({ type: 'payment.success' });
  const timestamp = String(Date.now() - 10 * 60_000);
  const result = verifyWebhookSignature({ rawBody: body, signature: sign(body, timestamp), timestamp });
  assert.equal(result.ok, false);
});

test('rejects a delivery with no signature', () => {
  const result = verifyWebhookSignature({ rawBody: '{}', signature: undefined, timestamp: String(Date.now()) });
  assert.equal(result.ok, false);
});
