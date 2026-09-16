# LINE Frontend / Customer Service Web Service v1.5

這個版本在原本 LINE + Google Sheets 綁定流程上加入 Gemini AI 客服，採「主動進入 AI 客服才呼叫 AI」的節省額度設計。

## 功能
- `選單` -> 1 LINE 綁定 / 2 課程查詢 / 3 繳費／收據（尚未串接） / 4 AI 客服 / 5 人工客服。
- LINE 綁定改為「一次性綁定授權碼」模式；家長／老師不能靠輸入任意姓名來取得授權。
- 課程查詢採「後端先授權、再查 Google Sheet、最後交 Gemini 整理」：AI 不直接讀取整份課表。
- 家長只能查自己已綁定的學生；老師只能查自己已綁定姓名的課表。使用者不能靠輸入其他學生姓名取得未授權資料。
- 預設課表工作表為「課表」；若不存在，啟動時會自動建立標題列，避免整個服務因分頁不存在而故障。
- AI 客服使用 Google Gemini `gemini-2.5-flash-lite`，預設不會在一般訊息自動呼叫 AI。
- 每位 LINE 使用者有獨立的短期對話記憶，只保留最近幾輪；部署重啟後記憶會清除。
- 內建每日「單一使用者」與「全系統」AI 請求保護上限，避免測試程式失控大量消耗免費配額。
- AI 只會取得目前 LINE 綁定的「身分」作為背景，不主動把學生姓名或教師姓名送給模型，也不會把整份 Google Sheet 丟給模型。
- AI 不知道的課程、繳費、收據、教師安排與學生個資事項，提示詞要求它不要猜，應請人工客服確認。
- `health` 會回報 Gemini 是否啟用、模型及本地保護上限。

## 綁定授權碼（重要）

為避免「輸入別人的名字再重新綁定」或大量窮舉造成資料外洩，系統不再接受使用者自行指定可查的學生／老師。請管理員在 Google Sheet 建立 `綁定授權碼` 工作表並填入一組一次性、不可預測的授權碼。

欄位：`授權碼`、`身分`、`可綁定學生`、`可綁定老師`、`狀態`、`綁定LINE User ID`、`使用時間`。

家長範例：`A8KQ7M2ZP4TX` / `家長` / `蔡時明、蔡小華` / 空白 / `可用`。
老師範例：`R5NW9X3BC7LD` / `老師` / 空白 / `王小明` / `可用`。

授權碼確認後會標記為 `已使用` 並綁定 LINE User ID。使用者每個時間窗最多嘗試 `BIND_CODE_MAX_ATTEMPTS` 次；預設 5 次 / 10 分鐘。建議授權碼至少 12 碼，使用系統附帶的 `generate-bind-code.js` 產生隨機碼。**不要使用學生姓名、生日、電話末碼等可猜測字串當授權碼。**

管理員可在本機執行：`node generate-bind-code.js`，每次取得一組新的隨機授權碼。

## Render 環境變數
必要：
- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `GOOGLE_SHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_JSON`

AI：
- `GEMINI_API_KEY`
- `GEMINI_MODEL`（預設 `gemini-2.5-flash-lite`）
- `AI_MAX_OUTPUT_TOKENS`（預設 500）
- `AI_MAX_HISTORY_TURNS`（預設 6）
- `AI_DAILY_REQUEST_LIMIT`（預設每位 LINE 使用者每日 30 次）
- `AI_TOTAL_DAILY_LIMIT`（預設全系統每日 300 次）
- `COURSE_SHEET_NAME`（預設 `課表`）
- `COURSE_QUERY_MAX_ROWS`（預設 20，單次最多提供給 AI 的已授權課程筆數）
- `BIND_AUTH_SHEET_NAME`（預設 `綁定授權碼`）
- `BIND_CODE_MAX_ATTEMPTS`（預設 5）
- `BIND_CODE_WINDOW_MS`（預設 600000，10 分鐘）
- `AI_SYSTEM_PROMPT`（可選，用來自訂客服人格與規則）

未設定 `GEMINI_API_KEY` 時，主程式仍可正常運作，但選單的 AI 客服會提示尚未設定。

## 部署
Render Build：`npm install`
Render Start：`node server.js`
Health：`/health`

## Gemini 免費方案注意事項
Google AI Studio / Gemini API 的免費方案與配額會依模型及政策調整。此版本因此另外加入本地使用量上限，避免超額請求；實際可用量仍以 Google 官方帳戶當下配額為準。

## 課表欄位
預設會自動建立：`學生姓名`、`日期`、`星期`、`上課時段`、`班別負責老師`、`備註與課務說明`。程式會自動尋找包含 `學生姓名` 與 `上課時段` 的標題列；日期、星期、老師、備註欄位可依上述名稱使用。

## 安全設計
- LINE webhook 驗證 `X-Line-Signature`。
- 第一次綁定與重新綁定都需要管理員一次性授權碼；**不再接受使用者自行輸入學生姓名／老師姓名來建立授權**。
- 授權碼決定可綁定的學生／老師，確認後即失效並記錄 LINE User ID。
- 綁定碼有嘗試次數限制，降低窮舉風險；錯誤回覆不揭露「名稱是否存在」等可用於枚舉的資訊。
- 查課前以 LINE User ID 對應綁定資料。
- 家長只以 `綁定暫存` 裡的 `studentNames` 作為可查範圍；老師只以已綁定的 `teacherName` 作為可查範圍。
- Gemini 永遠拿不到整份 Google Sheet；它收到的是後端已完成授權的課程結果。
- API 金鑰只使用 Render Environment Variables，不放在前端。
