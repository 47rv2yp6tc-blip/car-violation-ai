# RoadLens AI

AI 交通違規影像分析學習展示原型。

## 法規資料

- 全國通用資料存於 `data/penalty-rules.json`。
- 條文來源：臺灣全國法規資料庫 `law.moj.gov.tw`。
- 金額欄位只表示估計範圍，不是正式裁罰。
- 固定違規代碼只由後端規則引擎配對，AI 不得自行產生金額。
- 地方交通規則不得直接套用，除非另經官方來源核對並加入 `localRules`。
- 報告需保留官方條文連結、資料版本、生效／修正狀態及人工確認提示。

## 裁罰基準

統一裁罰基準及處理細則：https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0080029

此項僅提供官方參考；實際處罰須依當地執法機關裁罰基準與個案事證確認。

## 測試

```sh
npm test
npm run build
```
