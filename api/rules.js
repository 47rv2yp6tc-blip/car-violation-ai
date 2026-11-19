import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const rules = require('../data/penalty-rules.json');
const rulesByCode = new Map(rules.map((rule) => [rule.id, rule]));

function toFineValue(value) { if (value == null || value === '') return null; return Number.isFinite(Number(value)) ? Number(value) : null; }

export function calculateFine(code) {
  const rule = typeof code === 'string' ? rulesByCode.get(code) : null;
  if (!rule) return { rule:null, fineMin:null, fineMax:null, status:'rule_not_found' };
  const fineMin = toFineValue(rule.fineMin);
  const fineMax = toFineValue(rule.fineMax);
  return { rule:{ id:rule.id,name:rule.name,description:rule.description||'',law:rule.law||'',lawText:rule.lawText||'',ruleVersion:rule.ruleVersion||'unversioned',lastUpdated:rule.effectiveDate||null,source:rule.source||'',jurisdiction:rule.jurisdiction||'',vehicleScope:rule.vehicleScope||'',subcodes:rule.subcodes||[],fineNote:rule.fineNote||'',localRules:Array.isArray(rule.localRules)?rule.localRules:[] }, fineMin, fineMax, status: rule.fineStatus==='estimated_range' ? 'estimated_range' : 'calculated' };
}

export function calculateTotal(items) {
  const priced = items.filter((item) => Number.isFinite(item.fineMin) && Number.isFinite(item.fineMax));
  return priced.length ? { min:priced.reduce((sum,item)=>sum+item.fineMin,0), max:priced.reduce((sum,item)=>sum+item.fineMax,0) } : {min:null,max:null};
}
