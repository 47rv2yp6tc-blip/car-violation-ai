import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFine, calculateTotal } from '../api/rules.js';
import { validateModelResult } from '../api/schema.js';

const source = await import('../api/analyze.js?test=' + Date.now()).catch(() => null);

test('analyze module loads as an ES module', () => { assert.ok(source && typeof source.default === 'function'); });
test('repository does not expose a Gemini key in source files', async () => {
  const fs = await import('node:fs/promises');
  const files = ['../index.html', '../upload-fix.js', '../README.md', '../api/analyze.js'];
  for (const file of files) {
    const text = await fs.readFile(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /AIza[0-9A-Za-z_-]{20,}/);
  }
});
test('rules calculate fines independently from model output', () => {
  const result = calculateFine('疑似闖紅燈');
  assert.equal(result.status, 'needs_official_data');
  assert.deepEqual(calculateTotal([{ fineMin: 100, fineMax: 200 }, { fineMin: null, fineMax: null }]), { min: 100, max: 200 });
});
test('schema accepts uncertain and multi-vehicle-safe results', () => {
  const result = validateModelResult({ violations: [{ violation: '疑似違規', confidence: 45, uncertain: true, evidence: '不足', reason: '缺少標線', additionalInformation: ['補拍標線'], vehicleId: 'Vehicle 2' }] });
  assert.equal(result.ok, true);
  assert.equal(result.value.violations[0].uncertain, true);
  assert.equal(result.value.violations[0].vehicleId, 'Vehicle 2');
});
test('schema rejects malformed model results', () => {
  assert.equal(validateModelResult({ violations: [{}] }).ok, true);
  assert.equal(validateModelResult({ summary: 'missing list' }).ok, false);
});
