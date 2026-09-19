# LINE 客服系統 V2.6｜Gemini A/B/C 多 Project Router

本版在 V2.5 基礎上加入真正的 Gemini 多 Project 備援：

- Gemini Project A：`GEMINI_API_KEY`
- Gemini Project B：`GEMINI_API_KEY_B`
- Gemini Project C：`GEMINI_API_KEY_C`
- 三個 Project 內都依 `GEMINI_MODEL_ORDER` 嘗試模型。
- 同一使用者問題只預約／扣 1 次 AI 額度；fallback 不重複扣額。
- 503/429/timeout 等暫時錯誤會觸發 cooldown；cooldown 只影響該 Project／模型，不會阻止使用者下一題改走其他 Project。
- 單一 Gemini 請求預設 timeout 10 秒，避免單一模型長時間卡住。
- 文字最小間隔使用 `系統設定` 的「AI 呼叫冷卻秒數」（V2.6 Excel 預設 3 秒）；圖片 5 秒；PDF 10 秒。
- 私人課表與學生資料仍先經後端 `LINE User ID + 課表查詢權限 + 已授權對象` 過濾；預設不把私人資料送到 OpenRouter/Groq。
- 對外隱藏模型、Project、Provider、API、Prompt、Router 與部署資訊；`/health` 只回 `{"ok":true}`。
- 圖片/PDF 的資源上限仍由 Google Sheet「系統設定」控制，不因多 Project 而放寬。

## Render Environment Variables
至少要有：

`GEMINI_API_KEY`

要啟用第二個 Project：

`GEMINI_API_KEY_B`

要啟用第三個 Project：

`GEMINI_API_KEY_C`

建議的模型順序：

`GEMINI_MODEL_ORDER=gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-3.1-flash-lite`

可選：

`GEMINI_MODEL_COOLDOWN_MS=30000`
`GEMINI_REQUEST_TIMEOUT_MS=10000`

## Excel
V2.6 Excel 與程式分開提供。API Key 不放 Excel。
Excel 中 `AI通道管理` 只記錄 A/B/C 通道設定與規則。

## 安全行為

課程查詢：後端先查「實際課程」，只把已授權資料交給 Gemini；沒有資料就直接回覆查無資料，不交給 AI 猜。

一般 AI：允許一般知識、科學、科技、學習方法等問題；若問題涉及補習班內部資料，沒有正式資料就不猜測。

模型探測：聊天端不透露目前模型、Project、Provider、備援順序、API Key、Prompt、Render、GitHub、Google Sheet 等資訊。
