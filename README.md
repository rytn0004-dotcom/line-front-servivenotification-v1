# LINE 客服系統 V2.9.11

本版重點：AI 客服「路由防誤擋＋真正失敗降級」。

## 核心原則
1. 路由判斷只是決定「優先使用搜尋或一般模型」，不是拒絕使用者問題。
2. 即時搜尋失敗時，Gemini 會再嘗試一次不帶搜尋工具的降級回答。
3. 即時搜尋失敗不會直接變成「AI 客服目前暫時無法使用」；會繼續嘗試 Cloudflare 文字模型。
4. Cloudflare 文字模型支援 Native REST 與 OpenAI-compatible transport 雙路徑。
5. 一般問題不因出現「課程／PDF／prompt／天氣」等單字就被擋掉；只有高信心、明確動作才進入專用流程。

## 新環境變數
- AI_ROUTE_FAIL_OPEN=true
- AI_CLOUDFLARE_OPENAI_FALLBACK=true

既有 Gemini / Cloudflare / LINE / Google Sheets 環境變數均可沿用。

## Excel
不包含 Excel。沿用現有工作表與公式。

## 選單與首次綁定引導
- 選單現在明確標示本次測試開放功能：① LINE綁定、④ AI客服、⑥ 圖片製作；②、③、⑤ 以未開放提示降低家長誤操作。
- 保留提示「請先完成LINE綁定，再進行其他查詢」。
- 未完成 LINE 綁定的使用者第一次／尚未綁定狀態下輸入「選單」時，會先收到選單文字，再收到 `binding-guide.png` 綁定流程圖。
- 流程圖內容與目前實際綁定流程一致：選擇 ① LINE綁定 → 家長／老師 → 輸入學生或老師姓名 → 核對 → 回覆「確認」→ 綁定完成；課表查詢仍需管理員開啟權限。
- 綁定流程圖使用服務本身靜態檔案，不需要 Cloudflare；`PUBLIC_BASE_URL` 已設定時，LINE 可直接取得圖片。

## V2.9.3 測試提醒
- 本次家長測試建議先使用 ① LINE綁定、④ AI客服、⑥ 圖片製作。
- AI 每人每日基本額度仍由「系統設定」的「每人每日基本額度」控制；目前正式測試設定應為 5。
- 本版沒有修改 Excel，也沒有把 Excel 放入 ZIP。


## V2.9.4 AI 真正故障診斷與 Cloudflare 備援修正
1. Gemini model/project cooldown 不再靜默跳過；Render Log 會記錄 SKIPPED、原因與剩餘冷卻時間。
2. `AI_ALL_PROVIDERS_FAILED summary` 新增 skipped、Cloudflare transport/response diagnostics，方便定位真正故障點。
3. Cloudflare 文字回覆解析擴充：Native REST 與 OpenAI-compatible 支援多種 content 結構，不再只抓單一路徑。
4. Cloudflare HTTP error、invalid JSON、empty response、timeout 會分別記錄，且不記錄 API Token 或完整使用者 Prompt。
5. Cloudflare 某個模型／transport 出現 403/404/429 等可繼續嘗試其他模型／transport，不會過早中止整個 fallback。
6. 不新增額外 Cloudflare 付費／配額消耗型啟動測試；啟動 preflight 仍只做授權檢查。
7. 保留 V2.9.3 家長測試選單：① LINE綁定、④ AI客服、⑥ 圖片製作。
8. 不包含 Excel。


# V2.9.5 AI Provider 故障修正版

本版針對實際 Render Log 中的 Gemini 503/429 與 Cloudflare 文字模型空回應進行修正：

1. Gemini 429 且明確屬 quota exceeded 時，改為暫時冷卻整個 Project，避免同一 Project 的所有模型逐一重試而浪費等待時間；其他 Project 仍可立即接手。
2. Gemini 503 高負載採短暫模型冷卻，避免長時間誤鎖。
3. Cloudflare 文字備援預設優先嘗試 OpenAI-compatible `/v1/chat/completions`，失敗再嘗試原生 `/ai/run`；兩條 transport 都保留。
4. Cloudflare 文字回應解析擴充：支援 choices、result.response、result.text、output_text、generated_text、message/content、SSE 等常見格式。
5. Cloudflare 200 但空回應時，會短暫冷卻該模型並繼續下一 transport／下一模型，不再立即結束整條備援。
6. Render Log 的 AI_ALL_PROVIDERS_FAILED summary 增加 attempt/skip/cloudflare 數量，便於診斷。

本版不新增啟動時實際 AI 推理測試，不會因部署而額外消耗 Gemini 或 Cloudflare 推理配額。


## V2.9.6 Provider cooldown policy
- Gemini cooldown is **model-only**. A failure on gemini-3.8-flash cannot suppress gemini-3.1-flash-lite in the same Project.
- Gemini 503 gets a short model cooldown (default 20s).
- Gemini 429 quota/rate-limit is applied to the specific model only (default 5min), while other models in the same Project remain eligible.
- Gemini 401/403 is also isolated to the specific model; other models remain testable.
- Project-wide cooldown state has been removed from the active server.
- This prevents a single model failure from taking an otherwise healthy Project out of the rotation.


## V2.9.8 Gemini Project mapping / cooldown hotfix
1. Gemini A/B/C now expose the actual configured Google Cloud Project IDs in Render diagnostics (Project ID only; no API key is logged).
2. Confirmed mapping used by this release: A=`gen-lang-client-0348350940`, B=`gen-lang-client-0609456009`, C=`gen-lang-client-0705859251`; Render environment variables `GEMINI_PROJECT_ID_A/B/C` can override these values.
3. Removed the stale `clearProjectCooldown(...)` call that remained after the model-only cooldown migration and could throw `clearProjectCooldown is not defined`.
4. Gemini cooldown remains model-only: one model's 429/503 does not suppress other models in the same Project.
5. AI route diagnostics now show `slot`, `projectId`, `cooldownScope=model-only`, and `projectCooldownDisabled=true`.

### Expected startup diagnostics
```text
Gemini API preflight OK { project: 'A', projectId: 'gen-lang-client-0348350940', ... }
Gemini API preflight OK { project: 'B', projectId: 'gen-lang-client-0609456009', ... }
Gemini API preflight OK { project: 'C', projectId: 'gen-lang-client-0705859251', ... }
```

The Project IDs are diagnostic identifiers, not secrets. API keys are never logged.


## V2.9.8 Gemini 專案優先順序
- 預設優先順序為 `B → C → A`，也就是先使用 `GEMINI_API_KEY_B`。
- 可用 `GEMINI_PROJECT_ORDER` 自訂順序，例如 `A,B,C`。
- Project-wide cooldown 仍停用；冷卻只套用到單一 Project + 單一模型。
- 429 quota 與一般 429 不再重複設定 cooldown，避免較短 cooldown 覆蓋 quota cooldown。


V2.9.9 - AI/LINE delivery diagnostics
- 保留 Gemini B,C,A 優先順序與 model-only cooldown。
- 新增 traceId、LINE event queueWaitMs、LINE delivery success/failure 診斷，分辨 AI 成功但 LINE 回覆失敗的情況。
- 不新增 Excel。


V2.9.10 修正：避免 AI 回覆已成功送達後，後續 Google Sheets saveInteraction 失敗又進入 catch，再次以 Push 發送錯誤訊息造成雙回覆與 Push 額度消耗。加入 webhookEventId 去重、replyToken delivery 記錄與 delivered 後抑制第二次使用者訊息。


# V2.9.11 LINE 雙回覆防護
1. Reply API 回覆後，不再因 network timeout / 5xx 等「結果不明」狀況立即改用 Push，避免 Reply 已成功但客戶又收到第二則 Push。
2. 只有可確認 Reply 未送出的情況（例如 invalid reply token 或 429）才允許 fallback 到 Push。
3. Push 使用 `X-Line-Retry-Key`，降低 Push 重試造成重複訊息的風險。
4. 增加 `LINE delivery success` 診斷：Reply／Push、HTTP status、request id、是否使用 retry key。
5. 若 LINE 發送結果不明，事件標記為 ambiguous；外層錯誤處理不再再送第二則使用者錯誤訊息。
6. 保留 Gemini B→C→A 優先順序、model-only cooldown、Project-wide cooldown disabled。


# V2.9.11 LINE delivery duplicate protection
- Reply 失敗時，不再對所有錯誤都立即 fallback 到 Push。
- 只有可確認 Reply 未送出的 400 invalid reply token／429 才允許 Push fallback。
- Reply timeout／5xx／network error 視為 delivery ambiguous，避免「Reply 實際成功 + Push 再送一次」。
- Push 加上 `X-Line-Retry-Key`，降低重試造成重複訊息的風險。
- AI 回覆送出後若後續 Google Sheets saveInteraction 失敗，不再二次回覆使用者。
- webhookEventId 去重仍保留。
