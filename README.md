# LINE 客服系統 V2.7｜確認送出＋長等待＋LINE 載入動畫＋即時資訊

本版延續 V2.6 Gemini A/B/C 多 Project Router，重點是降低誤切換、改善 LINE 使用體驗與提高答案完整性。

## V2.7 行為
- 不再以 10 秒未回覆就切模型。一般問題預設最長等待 90 秒、圖片 120 秒、PDF 150 秒；單一 Gemini 模型本身預設最多等待 60 秒。
- 503／429／5xx 等明確錯誤會立即進行 fallback；單純「仍在生成」不因短暫沉默而切換。
- 使用 LINE 原生 loading animation，處理期間在一對一聊天顯示載入動畫；長於 50 秒會自動刷新載入動畫。LINE 官方支援 5～60 秒的 loading animation，且在官方帳號送出訊息時會自動消失。
- 若 AI 最終處理時間超過安全回覆窗口，程式改用 push message 回傳，避免 reply token 過期。LINE 官方規定 reply token 僅能使用一次，並建議盡快使用。
- 圖片／PDF 收到文字要求後先顯示「確認送出／修改要求／取消」快速回覆，不再由 AI 判斷是否還需要追問。
- 涉及「2026、目前、最近、最新」等即時性問題時，可啟用 Google Search grounding；今天／星期／現在時間仍由後端直接回答。
- API、模型、Project、Provider、Prompt 等內部資訊仍對外隱藏。
- 私人課表仍先做 LINE User ID＋課表查詢權限＋授權對象過濾。

## Render Environment Variables
至少：
- `GEMINI_API_KEY`

可選備援：
- `GEMINI_API_KEY_B`
- `GEMINI_API_KEY_C`

建議：
- `GEMINI_MODEL_ORDER=gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-3.1-flash-lite`
- `GEMINI_REQUEST_TIMEOUT_MS=60000`
- `GEMINI_MODEL_COOLDOWN_MS=30000`
- `AI_ENABLE_GOOGLE_SEARCH=true`

Excel 與程式分開提供；API Key 不放 Excel。
