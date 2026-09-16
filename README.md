# LINE 客服 V2.0：AI 多通道自動切換

## 核心行為
- Gemini 為主通道。
- OpenRouter 為可選備援，預設模型 `openrouter/free`。
- Groq 為可選第二備援，只有同時設定 `GROQ_API_KEY` 與 `GROQ_MODEL` 才啟用。
- `AI_PROVIDER_ORDER` 可調整順序，例如 `gemini,openrouter,groq`。
- 同一個使用者問題只預扣 1 次 AI 額度；主通道失敗後切換備援不重複扣額。
- 所有通道都失敗時，會退還本次 AI 額度，再回傳系統錯誤提示。
- 課程／學生私有資料預設只送 Gemini；若 Gemini 失敗，改提供後端授權查詢結果，不自動把私有資料送到 OpenRouter/Groq。
- 如已確認第三方資料政策並希望允許私人資料備援，才在 Render 設定 `AI_PRIVATE_DATA_FALLBACK=true`。

## Render Environment Variables
必填：
- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `GOOGLE_SHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_JSON`

主 AI：
- `GEMINI_API_KEY`
- `GEMINI_MODEL=gemini-3.1-flash-lite`

備援：
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL=openrouter/free`
- `GROQ_API_KEY`
- `GROQ_MODEL`

其他：
- `AI_PROVIDER_ORDER=gemini,openrouter,groq`
- `AI_PRIVATE_DATA_FALLBACK=false`

## 額度
`AI額度管理` 的既有邏輯保留：`剩餘次數 = 每日基本額度 + 額外次數 - 今日已用`。G 欄維持 Excel 公式，程式不覆蓋 G 欄公式。

## 商業／付費層
本版本提供「服務額度」所需的單一請求扣額與多通道路由基礎，但**沒有假裝已完成金流**。若要收費，應另外把付款／方案資料與 AI 額度連結，避免把供應商 API 免費配額直接當作商品轉售。
