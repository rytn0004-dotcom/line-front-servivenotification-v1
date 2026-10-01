# Render 客服 Keep Alive（13:00–23:00）

這是一個「只新增 GitHub Actions」的小型補丁，不需要修改 LINE Rich Menu，也不需要新增 Render Server。

## 目的

Render Free Web Service 連續 15 分鐘沒有進站流量會休眠。這個 workflow 在台灣時間：

- 12:57 先喚醒一次
- 13:02～22:57 每 5 分鐘呼叫一次 `/health`

因此正常情況下，下午 1 點到晚上 11 點期間不會因為 15 分鐘沒流量而進入 Render 的 Free 冷啟動狀態。

## 加入 GitHub

把以下檔案加入目前的 GitHub repository：

`.github/workflows/render-keepalive.yml`

## 第一次設定

到 GitHub repository：

`Settings → Secrets and variables → Actions → Variables`

新增 Repository variable：

`Name: RENDER_HEALTH_URL`

`Value: https://你的Render服務.onrender.com/health`

例如：

`https://example.onrender.com/health`

不需要放 LINE Token、Gemini API Key 或 Google Service Account。

## 測試

GitHub → Actions → `Render客服 Keep Alive` → `Run workflow`

成功時 Log 會顯示：

`Render keep-alive ping succeeded.`

## 注意

這是 Free 方案的「盡量保持喚醒」方案，不是絕對的 24/7 保證。GitHub 官方說 scheduled workflow 在高負載時可能延遲，甚至可能有排隊中的工作被丟棄；但排程最短可設為每 5 分鐘。若需要真正穩定的常駐，不應依賴 Free web service 的 keep-alive，而應改用 Render 付費 Web Service。 
