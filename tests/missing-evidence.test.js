import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeResult } from '../api/analyze.js';

function normalizeViolation(violation) {
  return normalizeResult({ violations: [violation] }).violations[0];
}

test('missing evidence caps confidence, forces uncertainty, and requests human review', () => {
  const result = normalizeViolation({
    violation: '疑似闖紅燈',
    confidence: 96,
    uncertain: false,
    missing_evidence: ['號誌狀態'],
  });

  assert.equal(result.confidence, 49);
  assert.equal(result.uncertain, true);
  assert.equal(result.needs_human_review, true);
  assert.ok(result.additionalInformation.includes('號誌狀態'));
});

test('complete evidence preserves a high-confidence result', () => {
  const result = normalizeViolation({
    violation: '疑似闖紅燈',
    confidence: 88,
    uncertain: false,
    missing_evidence: [],
  });

  assert.equal(result.confidence, 88);
  assert.equal(result.uncertain, false);
  assert.equal(result.needs_human_review, false);
});

test('contradictory evidence requires review without rewriting confidence', () => {
  const result = normalizeViolation({
    violation: '疑似闖紅燈',
    confidence: 82,
    uncertain: false,
    contradictions: ['影像顯示號誌可能為綠燈'],
  });

  assert.equal(result.confidence, 82);
  assert.equal(result.uncertain, false);
  assert.equal(result.needs_human_review, true);
});

test('missing evidence is deduplicated with model-provided follow-up advice', () => {
  const result = normalizeViolation({
    violation: '疑似闖紅燈',
    confidence: 70,
    additionalInformation: ['補拍號誌', '補拍號誌'],
    missing_evidence: ['號誌狀態', '號誌狀態'],
  });

  assert.equal(result.confidence, 49);
  assert.equal(result.uncertain, true);
  assert.deepEqual(result.additionalInformation, ['號誌狀態', '補拍號誌']);
});
