# LINE Frontend / Customer Service V1.1

用途：LINE Webhook、家長／老師綁定、關鍵詞「選單」喚醒、課程查詢／繳費／客服入口，以及既有 AI 額度控制資料結構。

本服務不負責：固定課表、調課課程、實際課表產生；也不負責課程提醒排程。

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

## Google Sheets
沿用既有 Google Service Account 與 Google Sheet。前台功能主要讀寫「聯絡人」「Webhook紀錄」「AI額度管理」「系統設定」等資料。
