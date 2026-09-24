# LINE 客服系統 V2.9.0

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
