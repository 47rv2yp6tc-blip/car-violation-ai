export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { images, image, mimeTypes, mimeType } = req.body || {};
    const list = Array.isArray(images) && images.length ? images : [image];
    const types = Array.isArray(mimeTypes) && mimeTypes.length ? mimeTypes : [mimeType];
    if (!list[0]) return res.status(400).json({ error: '請先提供照片。' });
    if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: '分析服務尚未設定 GEMINI_API_KEY。' });
    if (list.length > 6) return res.status(400).json({ error: '一次最多分析 6 張照片。' });
    const parts = [];
    for (let i = 0; i < list.length; i += 1) {
      const match = String(list[i]).match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
      if (!match || (types[i] && types[i] !== match[1])) return res.status(400).json({ error: '只支援格式正確的 JPG、PNG 或 WEBP 圖片。' });
      if (String(list[i]).length > 15 * 1024 * 1024) return res.status(413).json({ error: '照片過大，請使用較小檔案。' });
      parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
    }
    const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
    const prompt = `你是道路交通照片分析助手。這是同一事件的${list.length}張照片，請合併判讀。只根據可見證據，不可推測看不到的資訊，不要輸出車牌號碼或其他個資。對每個可能結果提供模型實際信心百分比；這不是被開罰機率。若證據不足使用「無法從此照片確認」。罰款若無法從已知法規可靠確認，fine_min 與 fine_max 必須為 null，fine_range 必須是「需查證」，不可猜測。只能回傳 JSON：{"violations":[{"type":"疑似違規名稱","confidence":0,"confidence_level":"高度信心/中等信心/低信心/不建議判定","reason":"AI判斷理由","evidence_location":"照片編號與判斷依據位置","fine_min":null,"fine_max":null,"fine_range":"需查證","regulation":"可能涉及法規或需查證","needs_human_review":"需要人工確認事項"}],"summary":"發現、照片間差異與不確定處","total_fine_min":null,"total_fine_max":null,"human_review_count":0}。confidence 僅代表模型對影像證據的信心，不代表實際收到罰單的機率，也不代表法律確定性。`;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
    const response = await fetch(endpoint, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ contents: [{parts: [{text: prompt}, ...parts]}], generationConfig: {temperature: 0.1, responseMimeType: 'application/json'} }) });
    const raw = await response.json().catch(() => ({}));
    if (!response.ok) { console.error('Gemini API response:', response.status, raw); return res.status(response.status === 429 ? 429 : 502).json({ error: raw?.error?.message || 'Gemini 暫時無法處理，請稍後再試。', upstream_status: response.status }); }
    const text = raw?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '{}';
    const parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, '').trim());
    const level = (confidence) => confidence >= 90 ? '高度信心' : confidence >= 70 ? '中等信心' : confidence >= 50 ? '低信心' : '不建議判定';
    const numberOrNull = (value) => Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.round(Number(value)) : null;
    const violations = Array.isArray(parsed.violations) ? parsed.violations.map((v) => {
      const confidence = Math.max(0, Math.min(100, Math.round(Number(v?.confidence) || 0)));
      const fineMin = numberOrNull(v?.fine_min);
      const fineMax = numberOrNull(v?.fine_max);
      const range = fineMin !== null && fineMax !== null ? `NT$ ${fineMin.toLocaleString()}～${fineMax.toLocaleString()}` : '需查證';
      return { type: String(v?.type || '無法從此照片確認'), confidence, confidence_level: String(v?.confidence_level || level(confidence)), reason: String(v?.reason || '照片證據不足。'), evidence_location: String(v?.evidence_location || '未提供'), fine_min: fineMin, fine_max: fineMax, fine_range: String(v?.fine_range || range), regulation: String(v?.regulation || '需要查證'), needs_human_review: String(v?.needs_human_review || '建議人工確認') };
    }) : [];
    const priced = violations.filter(v => v.fine_min !== null && v.fine_max !== null && !v.type.includes('無法'));
    const totalFineMin = priced.length ? priced.reduce((sum, v) => sum + v.fine_min, 0) : null;
    const totalFineMax = priced.length ? priced.reduce((sum, v) => sum + v.fine_max, 0) : null;
    const highest = violations.reduce((max, v) => Math.max(max, v.confidence), 0);
    const humanReviewCount = violations.filter(v => v.confidence < 90 || v.type.includes('無法') || v.needs_human_review).length;
    return res.status(200).json({ violations, total_fine: totalFineMin !== null && totalFineMin === totalFineMax ? totalFineMin : 0, total_fine_min: totalFineMin, total_fine_max: totalFineMax, highest_confidence: highest, human_review_count: humanReviewCount, summary: String(parsed.summary || '依多張照片可見資訊整理。') });
  } catch (error) { console.error('Gemini analysis error:', error); return res.status(500).json({ error: '分析結果格式無法讀取，請重新拍攝後再試。' }); }
}
