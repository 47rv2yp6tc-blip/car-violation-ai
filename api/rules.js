import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const rules = require('../data/penalty-rules.json');

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function toFineValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function findRule(violationType) {
  const type = normalize(violationType);
  return rules.find((rule) => {
    const names = [rule.id, rule.name, rule.description].map(normalize).filter(Boolean);
    return names.some((name) => type === name || type.includes(name) || name.includes(type));
  }) || null;
}

export function calculateFine(violationType) {
  const rule = findRule(violationType);
  if (!rule) return { rule: null, fineMin: null, fineMax: null, status: 'rule_not_found' };
  const fineMin = toFineValue(rule.fineMin);
  const fineMax = toFineValue(rule.fineMax);
  return {
    rule: {
      id: rule.id,
      name: rule.name,
      description: rule.description || '',
      law: rule.law || '',
      ruleVersion: rule.ruleVersion || 'unversioned',
      lastUpdated: rule.lastUpdated || rule.effectiveDate || null,
      source: rule.source || '',
    },
    fineMin,
    fineMax,
    status: fineMin === null || fineMax === null ? 'needs_official_data' : 'calculated',
  };
}

export function calculateTotal(items) {
  const priced = items.filter((item) => Number.isFinite(item.fineMin) && Number.isFinite(item.fineMax));
  return priced.length ? {
    min: priced.reduce((sum, item) => sum + item.fineMin, 0),
    max: priced.reduce((sum, item) => sum + item.fineMax, 0),
  } : { min: null, max: null };
}
