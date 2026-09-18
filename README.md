# LINE 客服 V2.2：多通道 + 圖片／PDF + 資源控管

## 本版本新增
- 一般文字 AI：1 次額度。
- 圖片 AI：2 次額度。
- PDF 文件 AI：3 次額度。
- 圖片與 PDF 不使用一般對話歷史，避免舊對話干擾媒體判讀。
- 圖片／PDF 僅走 Gemini；OpenRouter/Groq 不作為媒體備援，以避免不同供應商對圖片／文件能力與資料政策造成不一致。
- LINE 圖片進入後端後，以串流方式讀取並立即限制檔案大小；不把整個大型檔案無限制讀進記憶體。
- 圖片預設上限 8 MB；文件預設上限 10 MB。
- 每位使用者每日媒體流量預設 30 MB；全站每日媒體流量預設 300 MB。
- 媒體同時處理預設 1 個，避免 Render 記憶體瞬間被多個圖片／PDF 佔滿。
- 每次成功呼叫 Gemini 只扣一次對應額度；若 API 全部失敗，會退還本次額度與媒體流量預約。
- AI額度管理的 G 欄「剩餘次數」與 H 欄「額度日期」公式不被程式覆蓋。
- AI額度管理新增 O/P：今日媒體 MB、媒體額度日期。

## LINE 附件支援
LINE 可透過 messageId 取得使用者傳來的圖片、影片、音訊與檔案；本版本只處理圖片及 PDF 文件。LINE 官方目前的 image message 上限為 10 MB；本程式另設 8 MB 應用層上限，以保留 Render / Gemini 請求的資源餘裕。(LINE 官方文件：Receiving messages / Messaging API reference)

## Gemini 媒體限制
Gemini 支援圖片理解。官方文件指出，inline image data 的整體 request size 應小於 20 MB，對較大的檔案可使用 File API；本版本刻意把圖片與 PDF 上限設得更低，並限制同時處理數量，以降低 Render 記憶體與 API 請求風險。(Gemini 官方文件：Image understanding / File input methods)

## Google Sheet 自動增加的「系統設定」
若 `系統設定` 尚未有以下項目，程式啟動時會自動新增：
- AI 圖片額度：2
- AI 文件額度：3
- AI 圖片最大 MB：8
- AI 文件最大 MB：10
- AI 每人每日媒體 MB：30
- AI 全站每日媒體 MB：300
- AI 媒體同時處理數：1

Render 環境變數也可提供同名 fallback。若 Google Sheet 已有數值，優先使用 Google Sheet 設定。

## 安全與資源策略
1. 先檢查訊息類型、檔名、LINE 宣告檔案大小，再下載。
2. 實際下載採串流並設定硬上限；超過上限立即停止，不保留完整大檔。
3. 只允許 JPEG / PNG / WEBP / HEIC / HEIF 圖片與 PDF 文件。
4. 媒體訊息只在「④ AI客服」模式處理；課程／學生資料仍維持後端授權，不因圖片功能而放寬。
5. 媒體不使用既有文字聊天記憶。
6. 圖片／PDF 一律走 Gemini，不把學生圖片自動轉送 OpenRouter/Groq。
7. 媒體每日用量會寫回 `AI額度管理` O/P 欄，因此 Render 重啟後不會把當日媒體用量歸零。
8. `今日已用` 是「額度單位」而不是 API request 次數：文字 1、圖片 2、PDF 3。

## 既有多通道文字 AI
Gemini → OpenRouter → Groq 的 fallback 保留；同一個文字問題只扣 1 次額度。

V2.2 修正：LINE 圖片／PDF 與前後短時間內的文字要求會合併送入 Gemini；支援「少於500字解釋」等指示。LINE 回覆會移除 Markdown 標記與不可見空白，避免直接貼到 LINE 後出現異常排版。
