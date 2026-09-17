// Vercel serverless function. Keep OPENAI_API_KEY on the server only.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { image, mimeType } = req.body || {};
    if (!image || !String(image).startsWith('data:image/')) return res.status(400).json({ error: 'Missing image' });
    if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'OPENAI_API_KEY is not configured' });
    const prompt = `你是交通影像分析助手。只根據照片可見資訊，不要猜測。回傳嚴格 JSON：{"violations":[{"type":"違規類型或無法確定","law":"可能適用法規，無法確認則空字串","fine":數字或0,"confidence":0到100的整數,"reason":"可觀察的影像依據","additional_info":"若無法確認，需要的額外資訊"}],"total_fine":數字}。辨識車輛、車道/標線、紅綠燈、交通標誌、停車位置、行駛方向。只有照片足以支持時才列違規；不確定就列出 type=無法確定、fine=0，並說明需要什麼資訊。罰款只是台灣常見汽車罰鍰的估計，無法確認金額時填0。`;
    const response = await fetch('https://api.openai.com/v1/chat/completions', { method:'POST', headers:{'Authorization':`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'}, body:JSON.stringify({ model: process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini', temperature:0.1, response_format:{type:'json_object'}, messages:[{role:'user',content:[{type:'text',text:prompt},{type:'image_url',image_url:{url:image,detail:'high'}}]}]}) });
    const raw = await response.json(); if (!response.ok) return res.status(502).json({error:raw.error?.message||'Vision API failed'});
    const parsed = JSON.parse(raw.choices?.[0]?.message?.content || '{}');
    const violations = Array.isArray(parsed.violations) ? parsed.violations.map(v=>({...v, fine:Number(v.fine)||0, confidence:Math.max(0,Math.min(100,Number(v.confidence)||0))})) : [];
    return res.status(200).json({violations,total_fine:violations.reduce((sum,v)=>sum+(v.type==='無法確定'?0:v.fine),0)});
  } catch (e) { return res.status(500).json({error:'Unable to analyze image'}); }
}
