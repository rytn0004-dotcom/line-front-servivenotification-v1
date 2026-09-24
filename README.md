# LINE 客服系統 V2.9.4

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
