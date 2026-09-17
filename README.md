# RoadLens AI

汽車違規拍照辨識與預估罰鍰的學習展示原型。

## GitHub Pages 前端

網站入口是根目錄的 `index.html`。在 GitHub repository 的 **Settings → Pages** 選擇 **Deploy from a branch**、`main` 與 `/ (root)`。這樣 GitHub Pages 不會再因原本的 `car-ai` 檔名而找不到入口。

GitHub Pages 只能提供靜態 HTML/CSS/JavaScript，不能安全地執行後端模型或保存 API key。未部署 API 時，圖片上傳仍可使用，但分析會明確顯示無法連線，不會顯示固定或猜測的結果。

## 實際影像模型 API

`api/analyze.js` 是 Vercel serverless function。它把圖片交給具備 vision 能力的模型，要求模型分析車輛、車道與標線、紅綠燈、交通標誌、停車位置與行駛方向；無法確認時必須回傳「無法確定」及所需額外資訊。

建議部署方式：

1. 將 repository 匯入 Vercel。
2. 在 Vercel Project Settings → Environment Variables 設定 `OPENAI_API_KEY`。
3. 可選設定 `OPENAI_VISION_MODEL`，未設定時使用 `gpt-4o-mini`。
4. 部署後以 Vercel 網址開啟網站，讓 `/api/analyze` 與前端使用同一個網域，避免 CORS。
5. 若前端必須留在 GitHub Pages，請把 `index.html` 中的 `/api/analyze` 改成 Vercel API 完整 URL，並在 API 端加入只允許 Pages 網域的 CORS 設定。

API key 絕對不要寫入 `index.html`，也不要提交到 Git。

## 本機測試

```bash
npm install -g vercel
vercel dev
```

設定環境變數後，開啟 Vercel CLI 顯示的網址即可測試完整流程。

> 罰款只是預估值，不是正式法律判定；請以主管機關最新公告與實際執法人員認定為準。
