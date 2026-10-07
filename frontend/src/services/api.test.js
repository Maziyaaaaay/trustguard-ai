import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeMediaFile } from './api.js';

async function withResponse(body, status, run) {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(body), { status });
  try { await run(); } finally { globalThis.fetch = previous; }
}
const file = new File(['fixture'], 'sample.jpg', { type: 'image/jpeg' });

test('uncertain image review is a successful result without a numeric score', async () => {
  const body = { success: true, kind: 'image', risk: { score: null, level: 'REVIEW', scope: 'ai_image_indicator' }, image_detection: { available: true, status: 'inconclusive' } };
  await withResponse(body, 200, async () => assert.deepEqual(await analyzeMediaFile(file), body));
});
test('inconclusive AASIST audio review is a successful result without a numeric score', async () => {
  const body = { success: true, kind: 'audio', risk: { score: null, level: 'REVIEW', scope: 'ai_audio_spoof_indicator' }, audio_forensics: { aasist_detection: { available: true, status: 'inconclusive', spoof_score: null } } };
  await withResponse(body, 200, async () => assert.deepEqual(await analyzeMediaFile(file), body));
});
for (const kind of ['image', 'audio', 'video']) {
  test(`${kind} numeric result remains accepted`, async () => {
    const body = { success: true, kind, risk: { score: 15, level: 'LOW' } };
    await withResponse(body, 200, async () => assert.equal((await analyzeMediaFile(file)).kind, kind));
  });
}
test('an unexpected missing score is still rejected', async () => {
  await withResponse({ success: true, kind: 'video', risk: { score: null } }, 200, async () => {
    await assert.rejects(analyzeMediaFile(file), /incomplete result/);
  });
});
test('oversized hosted uploads explain the file limit', async () => {
  await withResponse({}, 413, async () => await assert.rejects(analyzeMediaFile(file), /4 MB/));
});
test('backend decoding errors are shown to the user', async () => {
  await withResponse({ success: false, error: 'File could not be decoded' }, 422, async () => await assert.rejects(analyzeMediaFile(file), /decoded/));
});
test('cancelled uploads preserve the abort error', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => { throw new DOMException('Aborted', 'AbortError'); };
  try { await assert.rejects(analyzeMediaFile(file), { name: 'AbortError' }); } finally { globalThis.fetch = previous; }
});
