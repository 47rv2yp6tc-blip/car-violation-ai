// Vercel serverless function for Gemini image analysis.
// GEMINI_API_KEY must exist only in the server environment.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image, mimeType } = req.body || {};

    if (!image || !String(image).startsWith('data:image/')) {
      return res.status(400).json({ error: 'Missing image data' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: 'GEMINI_API_KEY is not configured' });
    }

    const match = String(image).match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: 'Unsupported image format' });
    }

    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const mime = mimeType || match[1];
    const data = match[2];

    const prompt = `你是道路交通照片分析助手。只可根據照片中明顯可見的內容分析，絕對不可推測照片外看不到的資訊，例如時間、地點、車速、駕駛意圖、是否使用方向燈等。你的任務是判斷是否有可能的交通違規，且若不足以判斷，必須明確回應「無法從此照片確認」。不要強制判斷。

請分析這張照片中的：
- 車輛
- 車道與道路標線
- 紅綠燈
- 交通標誌
- 停車位置
- 行駛方向
- 其他與交通違規有關的影像資訊

僅在照片足以支持時才列出可能違規，例如：
- 違規停車
- 未依規定停車
- 違規變換車道
- 未依規定使用方向燈
- 其他可以從照片合理判斷的交通違規

若照片不足以確認，請在結果中加入一個違規項目：
- type: "無法從此照片確認"
- reason: "說明照片缺少哪些資訊"
- confidence: 0
- penalty: "需要更清晰照片，才能確認是否涉及違規"
- fine: 0
- additional_info: "請補充車輛位置、道路標線、號誌、標誌與車頭/車尾方向等資訊"

只能回傳 JSON，格式如下：
{
  "violations": [
    {
      "type": "可能的違規類型或無法從此照片確認",
      "reason": "照片中可直接觀察到的判斷依據",
      "confidence": 0,
      "penalty": "可能涉及的罰則資訊或說明未確認",
      "fine": 0,
      "additional_info": "若無法確認，說明需要補充什麼資訊；可確認時可空字串"
    }
  ],
  "total_fine": 0
}

總罰款應為所有可確認違規項目的罰款總和；若無法確認，總罰款為 0。
`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: mime,
                  data,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
    });

    const raw = await response.json();

    if (!response.ok) {
      return res.status(502).json({
        error: raw?.error?.message || 'Gemini API failed',
      });
    }

    const text = raw?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('') || '{}';

    const cleaned = text.replace(/^```json\s*|\s*```$/g, '').trim();
    const parsed = JSON.parse(cleaned);

    const violations = Array.isArray(parsed?.violations)
      ? parsed.violations.map((item) => ({
          type: String(item?.type || '無法從此照片確認'),
          reason: String(item?.reason || '照片沒有提供足夠可見證據。'),
          confidence: Math.max(0, Math.min(100, Math.round(Number(item?.confidence) || 0))),
          penalty: String(item?.penalty || '可能涉及的罰則未能從照片確認'),
          fine: Math.max(0, Math.round(Number(item?.fine) || 0)),
          additional_info: String(item?.additional_info || ''),
        }))
      : [];

    const total_fine = violations.reduce(
      (sum, item) => sum + (item.type === '無法從此照片確認' ? 0 : item.fine),
      0,
    );

    return res.status(200).json({
      violations,
      total_fine,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Unable to analyze image with Gemini',
    });
  }
}
