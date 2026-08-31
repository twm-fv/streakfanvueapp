import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { minutesForSource } from '../src/payments/credits.js';

test('bills whole minutes, rounded up', () => {
  assert.equal(minutesForSource(0), 1);
  assert.equal(minutesForSource(60_000), 1);
  assert.equal(minutesForSource(190_000), 4);
});
