# RoadLens AI

汽車違規拍照辨識與預估罰鍰的學習展示原型。

## 檔案與部署

- `index.html`：根目錄靜態前端入口，支援電腦上傳、手機拍照、拖曳、預覽與結果顯示。
- `api/analyze.js`：Vercel serverless API，使用 Gemini Vision；只在伺服器讀取 `GEMINI_API_KEY`。
- `vercel.json`：Vercel function 的執行時間設定。
- `car-ai`：舊版草稿，不是部署入口；請使用根目錄的 `index.html`。

## 建議部署：Vercel

Vercel 同時提供前端與 `/api/analyze`，請使用 Vercel 網址測試完整 AI 功能：

1. 將 repository 匯入 Vercel，Root Directory 使用 repository root。
2. 在 Vercel Project Settings → Environment Variables 設定：
   - `GEMINI_API_KEY`：Google AI Studio API key。
   - `GEMINI_MODEL`：`gemini-2.5-flash`（可省略，後端有預設值）。
3. 將變數套用到 Production。
4. 儲存後重新部署，使用 Vercel 的 `*.vercel.app` 網址。

API key 絕對不要放在 `index.html`、`car-ai` 或任何 Git 檔案中。前端只呼叫相對路徑 `/api/analyze`；後端使用 Gemini `generateContent`、`inlineData` 圖片資料與 JSON 回應格式。

## GitHub Pages 限制

GitHub Pages 只能提供靜態檔案，不能執行 `api/analyze.js` 或保存 Gemini secret。GitHub Pages 可展示前端與上傳介面，但 AI 分析請使用 Vercel 網址。若前端留在 GitHub Pages，必須另外使用 Vercel API 完整網址並設定嚴格的 CORS `ALLOWED_ORIGIN`。

## API 錯誤處理

後端會檢查 POST 方法、圖片格式（JPG/PNG/WEBP）、圖片大小、`GEMINI_API_KEY`，並處理 Gemini API 錯誤與 quota。照片不足時，結果必須明確標示「無法從此照片確認」，不會把照片看不到的資訊當成事實。

> 罰款只是預估值，不是正式法律判定；請以主管機關最新公告與實際執法人員認定為準。
