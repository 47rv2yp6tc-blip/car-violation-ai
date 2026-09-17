// Vercel serverless function for Gemini image analysis.
// GEMINI_API_KEY must exist only in the server environment.
export default async function handler(req, res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN;
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { image, mimeType } = req.body || {};
    if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Missing image data' });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: 'GEMINI_API_KEY is not configured' });
    }

    const match = image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return res.status(400).json({ error: 'Unsupported image format' });
    if (image.length > 15 * 1024 * 1024) {
      return res.status(413).json({ error: 'Image is too large; use an image under 10 MB' });
    }

    const mime = match[1];
    if (mimeType && mimeType !== mime) {
      return res.status(400).json({ error: 'Image MIME type does not match image data' });
    }

    const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
    const prompt = `你是道路交通照片分析助手。只根據照片中明顯可見的內容分析，不可推測照片外看不到的時間、地點、車速、駕駛意圖或方向燈狀態。若證據不足，必須使用「無法從此照片確認」，不要強制判斷。請分析車輛、車道、道路標線、號誌、交通標誌、停車位置與行駛方向。只能回傳 JSON：{"violations":[{"type":"可能的違規類型或無法從此照片確認","reason":"可見判斷依據","confidence":0,"penalty":"可能涉及的罰則或未能確認","fine":0,"additional_info":"需要補充的資訊"}],"total_fine":0}。confidence 為 0 到 100；無法確認時 fine 與 total_fine 必須為 0。`;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: mime, data: match[2] } }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
      }),
    });

    const responseText = await response.text();
    let raw = {};
    try {
      raw = responseText ? JSON.parse(responseText) : {};
    } catch {
      raw = { raw: responseText.slice(0, 500) };
    }

    if (!response.ok) {
      console.error('Gemini API response:', response.status, raw);
      const upstreamStatus = Number(raw?.error?.code) || response.status;
      const status = upstreamStatus >= 400 && upstreamStatus < 500 ? upstreamStatus : 502;
      return res.status(status).json({
        error: raw?.error?.message || 'Gemini API failed',
        upstream_status: upstreamStatus,
      });
    }

    const text = raw?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '{}';
    const parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, '').trim());
    const violations = Array.isArray(parsed.violations) ? parsed.violations.map((item) => ({
      type: String(item?.type || '無法從此照片確認'),
      reason: String(item?.reason || '照片沒有提供足夠可見證據。'),
      confidence: Math.max(0, Math.min(100, Math.round(Number(item?.confidence) || 0))),
      penalty: String(item?.penalty || '可能涉及的罰則未能從照片確認'),
      fine: Math.max(0, Math.round(Number(item?.fine) || 0)),
      additional_info: String(item?.additional_info || ''),
    })) : [];
    const total_fine = violations.reduce((sum, item) => sum + (item.type === '無法從此照片確認' ? 0 : item.fine), 0);
    return res.status(200).json({ violations, total_fine });
  } catch (error) {
    console.error('Gemini analysis error:', error);
    return res.status(500).json({ error: 'Unable to analyze image with Gemini' });
  }
}
