const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGES = 6;
const MAX_DATA_URL_LENGTH = 15 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 50_000;
const RETRYABLE_STATUS = new Set([500, 502, 503, 504]);

const promptFor = () => `你是具備影像理解能力的道路交通證據分析助手。
請先列出照片中實際看得到的事實：車輛位置、車道、道路標線與停止線、紅綠燈狀態、交通標誌、車輛方向、停車位置、道路環境，以及照片品質。
只回傳一個 JSON 物件，不要 Markdown 或程式碼圍欄，格式必須包含 quality、observed_facts、violations、summary 四個欄位。
每個 violation 必須包含 violation_type、confidence、evidence、reason、fine_min、fine_max、fine_range、missing_evidence。
confidence 是影像證據信心，不是收到罰單的機率，也不是法律確定性。無法可靠確認時，請使用「無法從此照片確認」並列出缺少的證據；fine_min 與 fine_max 無法可靠確認時使用 0，fine_range 使用「需查證官方資料」。`;

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

function numberOrNull(value) {
  return Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.round(Number(value)) : null;
}

function level(value) {
  return value >= 90 ? '高度信心' : value >= 70 ? '中等信心' : value >= 50 ? '低信心' : '不建議判定';
}

function parseModelJson(text) {
  const cleaned = String(text || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('模型未回傳 JSON');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function safeErrorMessage(error) {
  if (error?.name === 'AbortError') return 'AI 分析逾時，請稍後再試。';
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
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
    const contents = [{ parts: [{ text: promptFor() }, ...parts] }];
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
        response = await fetch(endpoint, {
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
    const parsed = parseModelJson(text);
    const quality = {
      usable: Boolean(parsed?.quality?.usable),
      issues: Array.isArray(parsed?.quality?.issues) ? parsed.quality.issues.map(String).slice(0, 10) : [],
      explanation: String(parsed?.quality?.explanation || ''),
    };
    const violations = Array.isArray(parsed?.violations) ? parsed.violations.map((item) => {
      const confidence = clampConfidence(item?.confidence);
      const fineMin = numberOrNull(item?.fine_min);
      const fineMax = numberOrNull(item?.fine_max);
      const type = String(item?.violation_type || '無法從此照片確認');
      return {
        type,
        violation_type: type,
        confidence,
        confidence_level: level(confidence),
        evidence: String(item?.evidence || '未提供'),
        evidence_location: String(item?.evidence_location || item?.evidence || '未提供'),
        reason: String(item?.reason || '未提供'),
        fine_min: fineMin,
        fine_max: fineMax,
        fine_range: String(item?.fine_range || '需查證官方資料'),
        missing_evidence: Array.isArray(item?.missing_evidence) ? item.missing_evidence.map(String).slice(0, 10) : [],
        needs_human_review: Boolean(item?.needs_human_review),
      };
    }) : [];
    const priced = violations.filter((item) => item.fine_min !== null && item.fine_max !== null && !item.type.includes('無法'));
    const totalFineMin = priced.length ? priced.reduce((sum, item) => sum + item.fine_min, 0) : null;
    const totalFineMax = priced.length ? priced.reduce((sum, item) => sum + item.fine_max, 0) : null;

    return jsonResponse(res, 200, {
      quality,
      observed_facts: Array.isArray(parsed.observed_facts) ? parsed.observed_facts.map(String).slice(0, 30) : [],
      violations,
      summary: String(parsed.summary || '未提供'),
      total_fine: totalFineMin !== null && totalFineMax !== null ? totalFineMin : null,
      total_fine_min: totalFineMin,
      total_fine_max: totalFineMax,
    });
  } catch (error) {
    console.error('Gemini analysis error', { name: error?.name, message: error?.message });
    return jsonResponse(res, error?.name === 'AbortError' ? 504 : 500, { error: safeErrorMessage(error) });
  }
}
