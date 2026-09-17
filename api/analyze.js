export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { images, image, mimeTypes, mimeType } = req.body || {};
    const list = Array.isArray(images) && images.length ? images : [image];
    const types = Array.isArray(mimeTypes) && mimeTypes.length ? mimeTypes : [mimeType];
    if (!list[0] || !process.env.GEMINI_API_KEY) return res.status(503).json({ error: !process.env.GEMINI_API_KEY ? '分析服務尚未設定 GEMINI_API_KEY。' : '請先提供照片。' });
    if (list.length > 6) return res.status(400).json({ error: '一次最多分析 6 張照片。' });
    const parts = [];
    for (let i = 0; i < list.length; i += 1) {
      const match = String(list[i]).match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
      if (!match || (types[i] && types[i] !== match[1])) return res.status(400).json({ error: '只支援格式正確的 JPG、PNG 或 WEBP 圖片。' });
      if (String(list[i]).length > 15 * 1024 * 1024) return res.status(413).json({ error: '照片過大，請使用較小檔案。' });
      parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
    }
    const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
    const prompt = `你是道路交通照片分析助手。這是同一事件的${list.length}張照片，請合併判讀，不要把每張當成獨立事件；若照片間結論不同，明確寫在 summary。只根據可見內容分析車輛、號誌、標誌、車道、停止線、禁停標線、車輛位置與方向。不要輸出車牌號碼或其他個資，不可推測看不到的資訊。證據不足使用「無法從此照片確認」。只能回傳 JSON：{"violations":[{"type":"名稱","reason":"依據","evidence_location":"照片編號與可見位置","confidence":0,"fine":0,"fine_range":"依所在地法規查證","regulation":"需查證","needs_human_review":"需確認事項"}],"summary":"發現、照片間差異、不確定處與是否重拍","total_fine":0}。`;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
    const response = await fetch(endpoint, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ contents: [{parts: [{text: prompt}, ...parts]}], generationConfig: {temperature: 0.1, responseMimeType: 'application/json'} }) });
    const raw = await response.json().catch(() => ({}));
    if (!response.ok) { console.error('Gemini API response:', response.status, raw); return res.status(response.status === 429 ? 429 : 502).json({ error: raw?.error?.message || 'Gemini 暫時無法處理，請稍後再試。', upstream_status: response.status }); }
    const text = raw?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '{}';
    const parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, '').trim());
    const violations = Array.isArray(parsed.violations) ? parsed.violations.map(v => ({ type: String(v?.type || '無法從此照片確認'), reason: String(v?.reason || '照片證據不足。'), evidence_location: String(v?.evidence_location || '未提供'), confidence: Math.max(0, Math.min(100, Math.round(Number(v?.confidence) || 0))), fine: Math.max(0, Math.round(Number(v?.fine) || 0)), fine_range: String(v?.fine_range || '依所在地法規查證'), regulation: String(v?.regulation || '需要查證'), needs_human_review: String(v?.needs_human_review || '建議人工確認') })) : [];
    return res.status(200).json({ violations, total_fine: violations.reduce((s,v) => s + (v.type.includes('無法') ? 0 : v.fine), 0), summary: String(parsed.summary || '依多張照片可見資訊整理。') });
  } catch (error) { console.error('Gemini analysis error:', error); return res.status(500).json({ error: '分析結果格式無法讀取，請重新拍攝後再試。' }); }
}
