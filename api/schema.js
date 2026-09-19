const STATUS = new Set(['confirmed', 'excluded', 'unknown', 'pending']);

export function validateModelResult(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.violations)) {
    return { ok: false, reason: 'missing_violations' };
  }
  const violations = value.violations.map((item) => {
    if (!item || typeof item !== 'object') return null;
    const confidence = Number(item.confidence);
    return {
      violation: String(item.violation || item.violation_type || '無法從此照片確認'),
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(100, Math.round(confidence))) : 0,
      evidence: String(item.evidence || '未提供'),
      uncertain: Boolean(item.uncertain) || confidence < 50,
      reason: String(item.reason || '未提供'),
      additionalInformation: Array.isArray(item.additionalInformation)
        ? item.additionalInformation.map(String).slice(0, 10)
        : Array.isArray(item.missing_evidence) ? item.missing_evidence.map(String).slice(0, 10) : [],
      vehicleId: String(item.vehicleId || item.vehicle || ''),
    };
  });
  if (violations.some((item) => !item)) return { ok: false, reason: 'invalid_violation' };
  return {
    ok: true,
    value: {
      quality: value.quality && typeof value.quality === 'object' ? value.quality : { usable: false, issues: ['模型未提供照片品質'] },
      observed_facts: Array.isArray(value.observed_facts) ? value.observed_facts.map(String).slice(0, 30) : [],
      violations,
      summary: String(value.summary || '未提供'),
    },
  };
}

export function validateConfirmation(value) {
  return STATUS.has(value) ? value : 'pending';
}
