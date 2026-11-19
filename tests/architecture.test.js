import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFine, calculateTotal } from '../api/rules.js';

test('fixed Taiwan rule codes never come from model text', () => {
  assert.equal(calculateFine('red-light').status, 'estimated_range');
  assert.equal(calculateFine('疑似闖紅燈').status, 'rule_not_found');
  assert.equal(calculateFine('unknown').status, 'rule_not_found');
});

test('rule ranges include law text, sources and vehicle scope', () => {
  const red = calculateFine('red-light');
  assert.equal(red.fineMin, 1800);
  assert.equal(red.fineMax, 5400);
  assert.match(red.rule.lawText, /闖紅燈/);
  assert.match(red.rule.source, /^https:\/\/law\.moj\.gov\.tw\//);
  assert.ok(Array.isArray(red.rule.subcodes));
  assert.ok(Array.isArray(red.rule.localRules));
  assert.ok(red.rule.vehicleScope);
});

test('estimate totals only sum finite ranges', () => {
  assert.deepEqual(calculateTotal([{fineMin:600,fineMax:1200},{fineMin:null,fineMax:null}]), {min:600,max:1200});
});
