# LINE Frontend / Customer Service V1.2

用途：LINE Webhook、家長／老師綁定、關鍵詞「選單」喚醒、課程查詢／繳費／客服入口，以及既有 AI 額度控制資料結構。

本版修正：
- 「選單」後輸入 `1` 會正確進入 LINE 綁定流程。
- `1 / 綁定 / 開始綁定 / 重新綁定` 都會啟動綁定。
- 選單 `2` 課程查詢、`3` 繳費／收據：目前功能未啟用，統一回覆「請諮詢人工客服」。
- `4` 人工客服可正常進入。
- 一般非喚醒訊息仍維持不自動回覆。

## Render
- Build Command: `npm install`
- Start Command: `node server.js`
- Health Check Path: `/health`

## Environment Variables
- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `GOOGLE_SHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_JSON`

不要把 JSON 金鑰、Channel Secret 或 Access Token 上傳到 GitHub。
