# RoadLens AI

汽車違規拍照辨識與預估罰鍰的學習展示原型。

## Production checklist

- 前端入口是根目錄 `index.html`；`car-ai` 是舊草稿，不是部署入口。
- `/api/analyze` 只在伺服器讀取 `GEMINI_API_KEY`，前端不保存 API key。
- Vercel 環境變數：`GEMINI_API_KEY` 必填；`GEMINI_MODEL` 建議設定為帳號可用的 Gemini Vision 模型，例如 `gemini-2.5-flash`。
- `data/penalty-rules.json` 是獨立罰款資料契約；正式使用前請填入所在地官方法規、金額、生效日與來源。AI 不得自行產生罰款數字。
- 建議執行 `npm test` 檢查模組載入與秘密掃描。

## 部署

Vercel：Root Directory 使用 repository root，將環境變數套用至 Production 後重新部署。GitHub Pages 只能提供靜態檔案，不能執行 `api/analyze.js` 或保存 Gemini secret；若從 GitHub Pages 使用 AI，必須另部署 API 並設定嚴格 CORS，否則請使用 Vercel 網址。

## 隱私與限制

照片會由瀏覽器傳送到本專案的 `/api/analyze`，再由伺服器傳給 Google Gemini；本專案不保存原始照片。分析歷史只保存瀏覽器 Local Storage 的摘要與結果，使用者可在設定中清除。照片品質不足、證據不完整或法律情境不明時，系統應顯示「無法從此照片確認」並要求重新拍攝。所有 AI 信心、照片品質與罰款範圍都是輔助資訊，不是正式法律判定。
