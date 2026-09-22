# LINE 客服系統 V2.8.2｜免費圖片製作＋選擇式確認

本版以 V2.7.1 為基礎，新增「⑥ 圖片製作」，圖片生成不使用 Gemini 生圖模型，也不啟用任何付費 Gemini 圖片 API。

## 主要功能
- LINE 選單新增「⑥ 圖片製作」。
- 圖片製作流程採選擇式引導：圖片類型 → 風格 → 構圖 → 內容 → 確認製作。
- 只有按「確認製作」才真正呼叫圖片生成 API；修改與取消不生成、不扣生圖張數。
- 目前圖片生成模型：`@cf/black-forest-labs/flux-1-schnell`（Cloudflare Workers AI）。
- 圖片生成預設 4 steps；可由 Render `CLOUDFLARE_IMAGE_STEPS` 或 Google Sheet「系統設定／圖片生成步數」調整，範圍 1～8。
- 內建每日每人、每日全站免費生圖張數限制，以及同時處理上限。
- 生成失敗（API 未成功產圖）會退回生圖張數；已成功產圖後則不退回，以免重複消耗免費資源。
- 生成圖片會暫存在 Render `/tmp`，提供 LINE 讀取約 15 分鐘後自動刪除。
- LINE 使用 `originalContentUrl` + `previewImageUrl` 傳回圖片；原圖與預覽均使用 HTTPS。
- 不對外揭露 Gemini、Cloudflare、Project、Provider、API、Prompt 等內部資訊。

## Cloudflare 免費資源
Cloudflare Workers AI 目前在 Free plan 提供每日 10,000 Neurons 的免費配置；FLUX.1 Schnell 的官方模型 ID 為 `@cf/black-forest-labs/flux-1-schnell`。官方文件列出的預設步數為 4、最大 8，生成回應包含 Base64 圖片，可直接轉成圖片檔。請注意 10,000 Neurons 是 Cloudflare Workers AI 的每日免費配置總量，不只本程式；其他同帳號 Workers AI 用量也會佔用該配置。

## Render 必填設定
在 Render → Service → Environment 加：

1. `CLOUDFLARE_ACCOUNT_ID`：Cloudflare 的 Account ID。
2. `CLOUDFLARE_API_TOKEN`：Workers AI API Token。
3. `PUBLIC_BASE_URL`：這個 Render Service 的 HTTPS 公開網址，例如 `https://xxx.onrender.com`。
4. 原本的 LINE／Google Sheet／Gemini 環境變數照舊。

圖片模型設定可用：
- Render：`CLOUDFLARE_IMAGE_MODEL=@cf/black-forest-labs/flux-1-schnell`
- Google Sheet：`系統設定` 的 `圖片生成模型`

若兩者都有設定，以 Google Sheet `系統設定` 的值優先；Render 環境變數是無設定該列時的備援。

## Cloudflare Token 建立
Cloudflare Dashboard → Workers AI → Use REST API → Create a Workers AI API Token，並取得 Account ID。目前 Cloudflare REST API 建立的 Workers AI Token 需要 `Workers AI - Read` 與 `Workers AI - Edit` 權限。

## 目前免費生圖資源保護預設
- 每人每日免費圖片：2 張
- 全站每日免費圖片：20 張
- 圖片生成步數：4
- 同時處理：1 張
- 單次最長等待：90 秒

以上可在 Google Sheet「系統設定」調整，不需要改 server.js。

## Excel 規格
AI 額度管理的既有 G 欄剩餘次數公式維持不變；V2.8.2 另使用 Q/R 欄記錄「今日生圖次數／生圖額度日期」，不覆蓋 G/H 公式。

## 注意
- 本版沒有接 Gemini `gemini-3.1-flash-image`，因目前 Gemini API Free Tier 不提供該圖片模型的免費使用。
- Cloudflare Workers AI 的免費配置不是永久保證；請以 Cloudflare 當下 Dashboard／官方定價為準。


## V2.8.2 修正
- 圖片製作流程優先使用目前的圖片流程狀態，避免舊的「LINE互動狀態」資料把圖片內容誤送進 AI客服。
- 若主機重新啟動導致圖片流程暫存遺失，會明確提示重新從選單進入，不會靜默掉回 AI客服。
- 圖片製作失敗時保留確認流程，成功後才清除狀態，方便稍後重試。
- 一般文字 AI 等待時間提高；「系統設定」的「AI 請求逾時秒數」現可直接控制整體等待，V2.8.2 範本設為 180 秒。
- Cloudflare 圖片 API 的 401／403／429 會顯示對應的設定／忙碌提示。


### V2.8.2 修正重點
- 一般 AI 文字預設最長等待提高至 180 秒；`GEMINI_REQUEST_TIMEOUT_MS` 可在 Render 調整。
- AI 等待期間持續更新 LINE 載入動畫，實際請求不會因載入動畫停止而中斷。
- Cloudflare 圖片錯誤改成分辨 400/401/403/404/429/5xx，並在 Render Log 記錄 Cloudflare 回傳的錯誤代碼、訊息與 CF-Ray（不記錄 API Token）。
- 圖片製作流程進行中時優先處理圖片流程，避免數字快捷鍵意外跳到其他功能。
- 圖片失敗時保留目前圖片製作確認流程，可重新按「確認製作」。
