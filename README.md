# LINE 客服系統 V2.8.8｜AI 客服全面修正版＋免費圖片製作

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


## V2.8.6 修正
- 一般 AI 客服加入更穩定的 Cloudflare 文字雙模型備援：預設先用 `@cf/google/gemma-4-26b-a4b-it`，失敗時再嘗試 `@cf/zai-org/glm-4.7-flash`。
- Cloudflare 文字模型預設啟用 `rejectIfBusy`；容量忙碌時快速回傳錯誤，不讓請求長時間卡在容量佇列。Cloudflare 自 2026-09-17 起支援此設定。
- 預設關閉 Gemma 4 thinking，以降低一般客服延遲；可用 `CLOUDFLARE_TEXT_ENABLE_THINKING=true` 開啟。
- Render Log 會逐一記錄 Cloudflare 文字模型失敗的 HTTP 狀態與模型，成功時記錄實際使用模型與耗時；不記錄 API Token。
- 一般客服 Prompt 強化：先理解問題、避免單一關鍵字誤判功能、缺資訊只追問必要內容、減少制式句、回答更具體自然。
- 圖片 Prompt 強化：依圖片類型、風格、構圖提供專業視覺指引，活動海報／宣傳圖會特別要求資訊層級、留白、焦點與可讀性；使用者未指定的文字不自行添加。
- 不修改 Google Sheet 結構，不覆蓋 AI額度管理 G/H 原有公式。

### V2.8.6 Render 新增（可直接使用預設值）
`CLOUDFLARE_TEXT_MODEL=@cf/google/gemma-4-26b-a4b-it`
`CLOUDFLARE_TEXT_MODEL_ORDER=@cf/google/gemma-4-26b-a4b-it,@cf/zai-org/glm-4.7-flash`
`CLOUDFLARE_TEXT_REJECT_IF_BUSY=true`
`CLOUDFLARE_TEXT_ENABLE_THINKING=false`
`CLOUDFLARE_TEXT_TIMEOUT_MS=60000`
`ENABLE_CLOUDFLARE_TEXT_FALLBACK=true`

Gemma 4 26B A4B 目前仍列於 Workers AI 可用模型；Cloudflare 官方文件提供 REST `/ai/run` 的 `messages` 用法。Cloudflare 於 2026-09-17 新增 `rejectIfBusy`，可避免同步推論在容量不足時等待佇列。


## V2.8.8 全面修正與大篩查

本版針對 AI 客服無法使用、普通文字被誤導到課程查詢，以及請求延遲等問題做程式層級的全面檢查與修正。

### 主要修正
- 「可以」「假日」等一般 2～6 字中文不再自動判定為學生／老師姓名。只有與目前使用者已綁定的姓名完全相符，才會進入姓名相關保護流程。
- 課程問題判斷收斂為明確的課程／上課／課表語境，不再因單獨出現「老師」就攔截一般 AI 問題。
- 媒體指令改為必須有明確圖片／文件／附件等語境，避免「請解釋這個概念」「分析市場」等普通文字被要求上傳媒體。
- `aiSettingNum` 遇到空白設定時會使用程式預設值，不會把空白錯誤轉成數字 0。
- AI 額度管理的 O:R 欄位初始化改為整批處理；一般 AI 請求不再每次重新逐列掃描並寫入整張媒體欄位。
- AI 額度寫入改為 Google Sheets `batchUpdate`；正常文字請求的額度寫入由多次逐格更新縮減為單次批次更新。
- G/H 公式不再被一般額度使用流程覆蓋；正常使用不寫入 H 欄，G/H 只在新建資料列時建立公式。
- Cloudflare 文字備援與 OpenRouter/Groq 備援保存對話歷史時，會同時保存本次使用者訊息與 AI 回覆，避免備援通道下的上下文斷裂。
- OpenAI 相容通道加入 AbortController timeout，避免外部通道卡住整體請求。
- 僅設定 Cloudflare Workers AI 時，④ AI客服仍視為已配置 AI 通道。
- Render 啟動時新增 Gemini A/B/C API preflight，並顯示實際缺少或無法存取的模型；同時保留 Cloudflare Workers AI auth preflight。
- AI 請求紀錄會顯示路由計畫、額度保留耗時、實際成功通道與總耗時；錯誤紀錄不輸出 API Token。

### 本版測試
已完成 Node syntax check、靜態規則檢查，以及 mock provider integration tests，涵蓋正常 Gemini 成功、Gemini 429 後 Cloudflare 備援、Cloudflare 第一模型失敗後第二模型接手、即時搜尋不誤送到非搜尋模型、額度批次寫入、OpenAI 相容通道 timeout 與路由誤判回歸測試。

注意：本次測試未使用你的 Render／Gemini／Cloudflare 真實密鑰對外部 API 做實際請求；部署後仍需以 Render Log 的 preflight 與一次 LINE 真實訊息做 live smoke test。

## V2.8.8 本次追加修正：英文即時問題與客服語言
- 修正英文即時問題未進入 Google Search grounding 的路由問題，例如 `what's the weather`、`what's the weather in Taipei`、`latest news`。
- 保留中文即時資訊判斷，避免「老師今天辛苦了」這類一般對話誤觸發搜尋。
- 英文詢問今天日期／星期／時間可由後端以台灣時間直接回答。
- AI 系統提示加強：除非使用者明確要求其他語言，否則一律使用繁體中文。
- 回答「你是誰／你是什麼」時不得洩漏 Google、Gemini、Cloudflare、模型名稱、供應商或其他內部技術資訊。

## V2.8.8 測試重點
- `what's the weather` → 進即時搜尋路由
- `what's the weather in Taipei` → 進即時搜尋路由
- `how's the weather like` → 進即時搜尋路由
- `latest news` → 進即時搜尋路由
- `老師今天辛苦了` → 不進即時搜尋
- `今天台灣天氣` → 進即時搜尋


## V2.8.9 路由防誤擋修正
- 新增 `ai-route.js`，把 AI 路由判斷與內部資訊攔截獨立化並可自我測試。
- 即時搜尋只在明確出現「最新／目前／天氣／新聞／比分／匯率」等高信心訊號時啟用，普通對話不會因單一關鍵字被誤導。
- 即時搜尋失敗時，會依 `AI_ALLOW_FRESH_DEGRADED_FALLBACK=true` 安全降級到一般文字 AI；降級提示明確禁止捏造即時資訊。
- Cloudflare 文字備援與 OpenRouter/Groq 備援不再因 `useSearch=true` 被程式碼直接擋死。
- 內部資訊攔截改為「詢問本系統內部設定」才攔截；例如「prompt 是什麼？」、「Render 是什麼？」等一般知識問題不再被誤擋。
- 啟動時執行 `AI route self-test PASS`，先驗證路由判斷的正反例。

## V2.8.9 最終路由安全原則
- 路由判斷採「高信心才切換」：沒有明確即時訊號就走一般 AI，不因單一「天氣／新聞／課程／文件」字詞誤擋。
- 即時搜尋失敗不再直接阻斷整體 AI：會先完成 Gemini 搜尋通道嘗試，失敗後可安全降級到 Cloudflare／外部一般文字 AI；降級模式禁止捏造即時資料。
- 只有明確的「本人課表／上課安排」問題才導向②課程查詢；「什麼是課程」「什麼是課表」仍交給一般 AI。
- 只有明確的圖片／PDF 處理意圖才進入媒體待確認流程；「PDF 是什麼」「文件格式有哪些」仍交給一般 AI。
- 只有詢問本系統內部模型、Token、Prompt、部署設定等，才啟用內部資訊攔截；一般學習問題不攔。
