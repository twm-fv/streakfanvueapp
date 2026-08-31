import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { evaluateSocialExport } from '../src/safety/sfwGate.js';

test('clears a video tagged safe with harmless categories', () => {
  const verdict = evaluateSocialExport({ uuid: 'a', tags: { isNsfw: false, categories: ['fitness'] } });
  assert.equal(verdict.socialExportAllowed, true);
});

test('blocks a video tagged NSFW', () => {
  const verdict = evaluateSocialExport({ uuid: 'a', tags: { isNsfw: true, categories: [] } });
  assert.equal(verdict.socialExportAllowed, false);
});

test('blocks on a risky category even when isNsfw is false', () => {
  const verdict = evaluateSocialExport({ uuid: 'a', tags: { isNsfw: false, categories: ['Lingerie'] } });
  assert.equal(verdict.socialExportAllowed, false);
  assert.match(verdict.reason ?? '', /lingerie/i);
});

test('treats missing tags as not cleared', () => {
  assert.equal(evaluateSocialExport({ uuid: 'a' }).socialExportAllowed, false);
  assert.equal(evaluateSocialExport({ uuid: 'a', tags: {} }).socialExportAllowed, false);
});
