const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGES = 6;
const MAX_DATA_URL_LENGTH = 15 * 1024 * 1024;
const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    quality: { type: 'object', properties: { usable: { type: 'boolean' }, issues: { type: 'array', items: { type: 'string' } }, explanation: { type: 'string' } }, required: ['usable', 'issues', 'explanation'] },
    observed_facts: { type: 'array', items: { type: 'string' } },
    violations: { type: 'array', items: { type: 'object', properties: {
      violation_type: { type: 'string' }, confidence: { type: 'number' }, evidence: { type: 'string' }, reasoning: { type: 'string' }, missing_evidence: { type: 'array', items: { type: 'string' } }, fine_range: { type: 'string' }, fine_min: { type: ['number', 'null'] }, fine_max: { type: ['number', 'null'] }, regulation: { type: 'string' }, needs_human_review: { type: 'boolean' }
    }, required: ['violation_type', 'confidence', 'evidence', 'reasoning', 'missing_evidence', 'fine_range', 'fine_min', 'fine_max', 'regulation', 'needs_human_review'] } },
    summary: { type: 'string' }
  },
  required: ['quality', 'observed_facts', 'violations', 'summary']
};

const promptFor = (count) => `你是具備影像理解能力的道路交通證據分析助手。這是同一事件的 ${count} 張照片。請綜合所有角度，不要把照片分開當成不同事件。

請嚴格分兩階段：
第一階段只列出照片中實際看得到的事實，不得先猜違規：車輛數量與位置、車道、道路標線與停止線、紅綠燈顏色與可見狀態、交通標誌、車輛朝向／可見行進方向、停車位置、周圍道路環境，以及照片品質（模糊、過暗、過曝、解析度不足、主體太小、標線或號誌遮擋）。
第二階段只用第一階段事實判斷可能違規。若關鍵證據看不清楚、互相矛盾或缺少例外情況，請輸出「無法從此照片確認」或低 confidence，並列出 missing_evidence；不要為了產生違規而推測。

confidence 必須是你對影像證據的原始 0-100 信心，不是收到罰單的機率、不是法律確定性；不得把低信心調高。fine_min/fine_max 只有在照片情境與已知法規足以可靠支持時才填數字，否則必須是 null 且 fine_range 為「需查證」。不要輸出車牌號碼、臉部或其他個人資料。不要虛構 bounding box；evidence 以「第幾張照片＋畫面位置」描述即可。

請只回傳符合指定 JSON schema 的 JSON，不要 Markdown。若多張照片結論不同，summary 必須明確說明差異。`;

function jsonResponse(res, status, body) { return res.status(status).json(body); }
function parseImage(value, expectedType) {
  const match = String(value || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match || !ALLOWED.has(match[1]) || (expectedType && expectedType !== match[1])) return null;
  return { mimeType: match[1], data: match[2] };
}
function clampConfidence(value) { return Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0)); }
function numberOrNull(value) { return Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.round(Number(value)) : null; }
function level(value) { return value >= 90 ? '高度信心' : value >= 70 ? '中等信心' : value >= 50 ? '低信心' : '不建議判定'; }

export default async function handler(req, res) {
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });
  try {
    const body = req.body || {};
    const list = Array.isArray(body.images) && body.images.length ? body.images : [body.image];
    const types = Array.isArray(body.mimeTypes) && body.mimeTypes.length ? body.mimeTypes : [body.mimeType];
    if (!list[0]) return jsonResponse(res, 400, { error: '請先提供照片。' });
    if (!process.env.GEMINI_API_KEY) return jsonResponse(res, 503, { error: '分析服務尚未設定 GEMINI_API_KEY。' });
    if (list.length > MAX_IMAGES) return jsonResponse(res, 400, { error: `一次最多分析 ${MAX_IMAGES} 張照片。` });
    const parts = [];
    for (let i = 0; i < list.length; i += 1) {
      if (String(list[i]).length > MAX_DATA_URL_LENGTH) return jsonResponse(res, 413, { error: '照片過大，請壓縮後再試。' });
      const image = parseImage(list[i], types[i]);
      if (!image) return jsonResponse(res, 400, { error: '只支援格式正確的 JPG、PNG 或 WEBP 圖片。' });
      parts.push({ inlineData: image });
    }
    const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
    const requestBody = { contents: [{ parts: [{ text: promptFor(list.length) }, ...parts] }], generationConfig: { temperature: 0.05, responseMimeType: 'application/json', responseSchema: ANALYSIS_SCHEMA } };
    let response;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 55000);
      try { response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody), signal: controller.signal }); } finally { clearTimeout(timeout); }
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 1) break;
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    const raw = await response.json().catch(() => ({}));
    if (!response.ok) { console.error('Gemini API response:', response.status, raw); const status = response.status === 429 ? 429 : response.status >= 400 && response.status < 500 ? response.status : 502; return jsonResponse(res, status, { error: raw?.error?.message || 'Gemini 暫時無法處理，請稍後再試。', upstream_status: response.status }); }
    const text = raw?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '{}';
    const parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, '').trim());
    const quality = { usable: Boolean(parsed?.quality?.usable), issues: Array.isArray(parsed?.quality?.issues) ? parsed.quality.issues.map(String).slice(0, 10) : [], explanation: String(parsed?.quality?.explanation || '') };
    const violations = Array.isArray(parsed.violations) ? parsed.violations.map((item) => {
      const confidence = clampConfidence(item?.confidence);
      const fineMin = numberOrNull(item?.fine_min); const fineMax = numberOrNull(item?.fine_max);
      return { type: String(item?.violation_type || '無法從此照片確認'), violation_type: String(item?.violation_type || '無法從此照片確認'), confidence, confidence_level: level(confidence), evidence: String(item?.evidence || '未提供'), evidence_location: String(item?.evidence || '未提供'), reasoning: String(item?.reasoning || '照片證據不足。'), reason: String(item?.reasoning || '照片證據不足。'), missing_evidence: Array.isArray(item?.missing_evidence) ? item.missing_evidence.map(String).slice(0, 10) : [], fine_min: fineMin, fine_max: fineMax, fine_range: fineMin !== null && fineMax !== null ? `NT$ ${fineMin.toLocaleString()}～${fineMax.toLocaleString()}` : '需查證', regulation: String(item?.regulation || '需要依所在地法規查證'), needs_human_review: item?.needs_human_review !== false || confidence < 90 };
    }) : [];
    const priced = violations.filter((item) => item.fine_min !== null && item.fine_max !== null && !item.type.includes('無法'));
    const totalFineMin = priced.length ? priced.reduce((sum, item) => sum + item.fine_min, 0) : null;
    const totalFineMax = priced.length ? priced.reduce((sum, item) => sum + item.fine_max, 0) : null;
    return jsonResponse(res, 200, { quality, observed_facts: Array.isArray(parsed.observed_facts) ? parsed.observed_facts.map(String).slice(0, 30) : [], violations, total_fine: totalFineMin !== null && totalFineMin === totalFineMax ? totalFineMin : 0, total_fine_min: totalFineMin, total_fine_max: totalFineMax, highest_confidence: violations.reduce((max, item) => Math.max(max, item.confidence), 0), human_review_count: violations.filter((item) => item.needs_human_review).length, summary: String(parsed.summary || '目前證據不足，建議重新拍攝。') });
  } catch (error) { console.error('Gemini analysis error:', error); return jsonResponse(res, error?.name === 'AbortError' ? 504 : 500, { error: error?.name === 'AbortError' ? 'AI 分析逾時，請稍後再試。' : '分析結果格式無法讀取，請重新拍攝後再試。' }); }
}
