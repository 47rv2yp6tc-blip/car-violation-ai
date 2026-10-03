const STATUS = new Set(['confirmed', 'excluded', 'unknown', 'pending']);

export function validateModelResult(value) {
  if (!value || typeof value !== 'object') {
    return { ok: false, reason: 'missing_result' };
  }

  const violations = Array.isArray(value.violations) ? value.violations : [];

  if (violations.length === 0) {
    return {
      ok: true,
      value: {
        quality: value.quality && typeof value.quality === 'object'
          ? value.quality
          : { usable: false, issues: ['模型未提供照片品質'] },
        observed_facts: Array.isArray(value.observed_facts)
          ? value.observed_facts.map(String).slice(0, 30)
          : [],
        violations: [],
        summary: String(value.summary || '無法從此照片確認，請提供更完整影像。'),
      },
    };
  }

  const normalizedViolations = violations.map((item) => {
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
        : Array.isArray(item.missing_evidence)
          ? item.missing_evidence.map(String).slice(0, 10)
          : [],
      vehicleId: String(item.vehicleId || item.vehicle || ''),
    };
  });

  if (normalizedViolations.some((item) => !item)) {
    return { ok: false, reason: 'invalid_violation' };
  }

  return {
    ok: true,
    value: {
      quality: value.quality && typeof value.quality === 'object'
        ? value.quality
        : { usable: false, issues: ['模型未提供照片品質'] },
      observed_facts: Array.isArray(value.observed_facts)
        ? value.observed_facts.map(String).slice(0, 30)
        : [],
      violations: normalizedViolations,
      summary: String(value.summary || '未提供'),
    },
  };
}

export function validateConfirmation(value) {
  return STATUS.has(value) ? value : 'pending';
}
