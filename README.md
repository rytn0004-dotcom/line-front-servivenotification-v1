# LINE 客服系統 V2.8.5｜免費圖片製作＋Gemini 多模型額度自動切換

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


## V2.8.5 修正
- 修正 Gemini 多專案備援路由：同一個 Project 的第一個模型收到 429 時，不再直接跳過整個 Project。
- 429 會先冷卻「Project＋Model」，立即嘗試同一 Project 的下一個模型，再進入下一個 Project。
- 若 Google API 回覆明確屬於 quota exceeded / 每日配額限制，該模型會進入較長的配額冷卻，避免每次使用者請求都重複撞同一個已用完的模型。
- 只有 401／403 才會暫時鎖定整個 Project，避免錯誤的 API 權限設定造成無限重試。
- 預設模型順序保留高階 Flash，同時加入 `gemini-3.5-flash-lite` 與 `gemini-3.1-flash-lite` 作為更輕量的備援。
- `GEMINI_MODEL_QUOTA_COOLDOWN_MS` 預設 21600000（6 小時），可於 Render 調整。

## 針對 429 的行為
Google Gemini API 的 rate limits 是以 Project 為單位，而限制也依模型而異；因此 V2.8.5 不再把同一 Project 的所有模型一起視為失效。當某個 Project／Model 回傳 429 時，會依序嘗試同專案的其他模型與其他專案。


V2.8.5：即使 GEMINI_MODEL_ORDER 只設定單一模型，程式也會自動補齊 3.8 / 3.7 / 3.6 / 3.5 Flash-Lite / 3.1 Flash-Lite；429 只冷卻該專案＋模型，不會鎖死整個 Project。單模型預設最多等待 90 秒，整體 AI 一般等待仍由系統設定控制。Cloudflare Account ID / API Token 會自動去除前後空白。

## V2.8.5 重要設定
- `CLOUDFLARE_ACCOUNT_ID`：Cloudflare Account ID
- `CLOUDFLARE_API_TOKEN`：Workers AI API Token
- `PUBLIC_BASE_URL`：Render 公開 HTTPS 網址
- `CLOUDFLARE_TEXT_MODEL`：預設 `@cf/zai-org/glm-4.7-flash`，作為 Gemini 不可用時的一般文字客服備援
- `ENABLE_CLOUDFLARE_TEXT_FALLBACK=true`

V2.8.5 啟動時會用 Cloudflare 的 Model Search API 做「不消耗圖片生成額度」的 Token/Account 驗證，Render Log 會顯示 `Cloudflare Workers AI auth preflight OK` 或實際 HTTP 錯誤碼。

一般 AI 客服等待時間最低 180 秒；LINE loading 會每 20 秒重新啟動一次，避免長時間等待時畫面提早停止。
