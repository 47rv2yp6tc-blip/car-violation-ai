import { PROMPT_VERSION, buildVisionPrompt } from './prompt.js';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGES = 6;
const MAX_DATA_URL_LENGTH = 15 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 50_000;
const RETRYABLE_STATUS = new Set([500, 502, 503, 504]);

function jsonResponse(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

function parseImage(value, expectedType) {
  const match = String(value || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match || !ALLOWED.has(match[1]) || (expectedType && expectedType !== match[1])) return null;
  return { mimeType: match[1], data: match[2] };
}

function clampConfidence(value) {
  return Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0));
}

function level(value) {
  return value >= 90 ? '高度信心' : value >= 70 ? '中等信心' : value >= 50 ? '低信心' : '不建議判��';
}

function asStrings(value, limit = 10) {
  return Array.isArray(value) ? value.map(String).slice(0, limit) : [];
}

function parseModelJson(text) {
  const cleaned = String(text || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('模型未回傳 JSON');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function normalizeResult(parsed) {
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.violations)) {
    throw new Error('模型回傳格式不符合預期');
  }

  const violations = parsed.violations.map((item) => {
    const confidence = clampConfidence(item?.confidence);
    const violation = String(item?.violation || item?.violation_type || '無法從此照片確認');
    const uncertain = Boolean(item?.uncertain) || confidence < 50 || violation.includes('無法');
    return {
      type: violation,
      violation_type: violation,
      violation,
      confidence,
      confidence_level: level(confidence),
      uncertain,
      evidence: String(item?.evidence || '未提供'),
      evidence_location: String(item?.evidence_location || '未提供'),
      reason: String(item?.reason || '未提供'),
      additionalInformation: asStrings(item?.additionalInformation || item?.missing_evidence),
      missing_evidence: asStrings(item?.missing_evidence),
      evidenceCompleteness: String(item?.evidenceCompleteness || '未提供'),
      contradictions: asStrings(item?.contradictions),
      candidates: Array.isArray(item?.candidates) ? item.candidates.slice(0, 5) : [],
      vehicleId: String(item?.vehicleId || item?.vehicle || ''),
      needs_human_review: Boolean(item?.needs_human_review) || uncertain || asStrings(item?.contradictions).length > 0,
    };
  });

  return {
    quality: {
      usable: Boolean(parsed?.quality?.usable),
      issues: asStrings(parsed?.quality?.issues),
      explanation: String(parsed?.quality?.explanation || ''),
    },
    observed_facts: asStrings(parsed.observed_facts, 30),
    violations,
    summary: String(parsed.summary || '未提供'),
  };
}

function safeErrorMessage(error) {
  if (error?.name === 'AbortError') return 'AI 分析逾時，請稍後再試。';
  if (error?.message === '模型回傳格式不符合預期' || error?.message === '模型未回傳 JSON') return 'AI 回應格式無法驗證，請稍後再試。';
  return '分析服務暫時無法完成，請稍後再試。';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });

  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const list = Array.isArray(body.images) && body.images.length ? body.images : [body.image];
    const types = Array.isArray(body.mimeTypes) && body.mimeTypes.length ? body.mimeTypes : [body.mimeType];

    if (!list[0]) return jsonResponse(res, 400, { error: '請先提供照片。' });
    if (!process.env.GEMINI_API_KEY) return jsonResponse(res, 503, { error: '分析服務尚未設定。' });
    if (list.length > MAX_IMAGES) return jsonResponse(res, 400, { error: `一次最多分析 ${MAX_IMAGES} 張照片。` });

    const parts = [];
    for (let i = 0; i < list.length; i += 1) {
      if (typeof list[i] !== 'string' || list[i].length > MAX_DATA_URL_LENGTH) {
        return jsonResponse(res, 413, { error: '照片過大，請壓縮後再試。' });
      }
      const image = parseImage(list[i], types[i]);
      if (!image) return jsonResponse(res, 400, { error: '只支援格式正確的 JPG、PNG 或 WEBP 圖片。' });
      parts.push({ inlineData: image });
    }

    const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const contents = [{ parts: [{ text: buildVisionPrompt() }, ...parts] }];
    const requestBody = (withJsonMime) => ({
      contents,
      generationConfig: { temperature: 0.05, ...(withJsonMime ? { responseMimeType: 'application/json' } : {}) },
    });

    let response;
    let raw = {};
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
      try {
        response = await fetch(`${endpoint}?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody(attempt === 0)),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      raw = await response.json().catch(() => ({}));
      const unsupportedJsonMime = attempt === 0 && response.status === 400 && /responseMimeType|response_mime_type|generation_config/i.test(String(raw?.error?.message || ''));
      if (unsupportedJsonMime) continue;
      if (!RETRYABLE_STATUS.has(response.status) || attempt === 1) break;
      await new Promise((resolve) => setTimeout(resolve, 700));
    }

    if (!response?.ok) {
      console.error('Gemini request failed', { status: response?.status, reason: raw?.error?.status });
      const upstreamStatus = response?.status || 502;
      const status = upstreamStatus === 429 ? 429 : upstreamStatus >= 400 && upstreamStatus < 500 ? upstreamStatus : 502;
      return jsonResponse(res, status, { error: upstreamStatus === 429 ? '分析服務目前繁忙，請稍後再試。' : '分析服務暫時無法處理，請稍後再試。' });
    }

    const text = raw?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
    const result = normalizeResult(parseModelJson(text));
    return jsonResponse(res, 200, {
      ...result,
      model,
      promptVersion: PROMPT_VERSION,
      // Fine fields intentionally remain rule-engine-owned and are not read from Gemini.
      fineCalculation: { status: 'pending_rule_lookup' },
    });
  } catch (error) {
    console.error('Gemini analysis error', { name: error?.name, message: error?.message });
    return jsonResponse(res, error?.name === 'AbortError' ? 504 : 500, { error: safeErrorMessage(error) });
  }
}
