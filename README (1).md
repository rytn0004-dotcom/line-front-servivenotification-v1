# Rich Menu 模組

這是 LINE 客服 V2.9.20 的獨立 Rich Menu 模組。

## 目的

- 不取代既有 `server.js`。
- 不新增 npm 套件。
- `RICH_MENU_ENABLED` 沒有設為 `true` 時，不會呼叫 Rich Menu API。
- 啟用後，Render 啟動時會：讀取 JSON → 驗證 → 查找相同版本 → 沒有才建立 → 上傳圖片 → 設為 Default。
- 設定與圖片內容不變時會重用同一個 Rich Menu，不會每次重啟都建立新的。
- 修改圖片或 `richmenu.json` 後，內容雜湊會改變，模組會建立新的版本並設成 Default。

## GitHub 檔案

```text
richmenu/
├─ richmenu.js
├─ richmenu.json
├─ richmenu.png
└─ README.md
```

## Render 環境變數

```text
RICH_MENU_ENABLED=true
RICH_MENU_CONFIG_PATH=richmenu/richmenu.json
RICH_MENU_IMAGE_PATH=richmenu/richmenu.png
```

`LINE_CHANNEL_ACCESS_TOKEN` 直接沿用原本客服程式的環境變數，不需要另存一份 Token。

## 目前測試選單

```text
① LINE綁定  → 傳送「1」
② 課程查詢  → 傳送「2」
④ AI客服    → 傳送「4」
⑤ 人工客服  → 傳送「5」
⑥ 圖片製作  → 傳送「6」
功能選單     → 傳送「功能選單」
```

這些是 LINE Message Action，因此點 Rich Menu 後會走既有 `/webhook` 與既有文字指令處理，不需要另外建立 webhook。

## 更換自己的 Rich Menu 圖片

用同尺寸的 `richmenu.png` 覆蓋這個檔案即可；若你同時修改按鈕位置或 action，也同步修改 `richmenu.json`。

LINE Rich Menu 圖片目前要求 JPEG/PNG、寬度 800–2500px、高度至少 250px、長寬比至少 1.45，且上傳檔案上限 1 MB。這個模組在啟動時會先檢查尺寸與檔案大小。
