# 創意文案對撞機 (Creative Copy Collider)

以「弱關聯詞彙對撞」的創意方法學，搭配 SERP 搜索對齊產品概念，再以語言模型串連看似無關的詞，生成新鮮、不審美疲勞的文案。

## 功能區域
- **用戶輸入區**：輸入產品詞、關鍵詞、k 值。
- **概念對齊區**：透過 SERP API 取得產品特性、競品比較、背景知識的摘要（可關閉，改用 LLM 預估背景）。
- **待碰撞詞彙區**：從固定詞庫抽樣或依語意擴展生成。
- **碰撞初試區**：抽取 k 個詞與產品連結，流式生成 k 篇短文案，使用者可勾選候選。
- **深度碰撞區**：指定受眾 Persona 與發布媒體（可選），基於候選文案再寫出完整長文案，亦為流式輸出。
- **受眾 Persona 設定**：預設模板 + 自訂。

## 使用者動線（User Flow）
1. 輸入產品詞 → 送出 → 觸發概念對齊（SERP） → 填入「概念對齊區」卡片。
2. 系統顯示「待碰撞詞庫」隨機抽樣清單，可勾選或重新抽樣。
3. 設定 k 值 → 送出「初試碰撞」→ 右側面板以 **SSE 流式**逐段打印 k 篇短文案。
4. 使用者勾選候選文案 → 選擇 Persona 與媒體（或自訂）→ 送出「深度碰撞」→ 右側面板以 **SSE 流式**輸出完整文案（多稿）。
5. 支援一鍵複製、匯出 JSON/Markdown。

## 技術設計
- **後端**：FastAPI + Uvicorn；`sse-starlette` 提供 SSE（Server-Sent Events）流式輸出。
- **LLM**：OpenAI Chat Completions（支援 `stream=True`）。
- **搜尋**：SERP API（google-search-results）；無金鑰時可切 `USE_SERP=false`，改以 LLM 估算背景。
- **前端**：原生 JS + CSS，無框架；語意化 HTML；具狀態標示與錯誤顯示。
- **設定**：`.env` 讀取 `OPENAI_API_KEY`、`SERPAPI_API_KEY`、`MODEL`、`USE_SERP` 等。
- **國際化**：預設 zh-TW 提示詞；可自行擴充。

## 一鍵啟動
- macOS/Linux：`./run.sh`
- Windows：`run.bat`

啟動完成後，開啟：<http://127.0.0.1:8000/>

## .env 設定
複製 `.env.example` 為 `.env` 並填入：
```
OPENAI_API_KEY=sk-xxxx
SERPAPI_API_KEY=xxxxxx   # 若無可空白（USE_SERP=false 時不需）
MODEL=gpt-4o-mini
USE_SERP=true
PORT=8000
```

## API 端點（摘要）
- `POST /api/align`：產品詞 → 概念對齊（SERP/LLM）
- `GET  /api/terms`：取得待碰撞詞庫抽樣清單
- `POST /api/initial-collision`（SSE）：k 詞 × 短文案
- `POST /api/deep-collision`（SSE）：候選文案 × Persona/媒體 → 完整文案

## 安全/隱私
- 不儲存個資；請自行管理 API Key。
- 搜尋結果只做摘要對齊，不保存原文。

---

### License
MIT
