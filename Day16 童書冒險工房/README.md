
# Story Adventure Studio (童書冒險工坊)

支援**同時串流**生成 3 組大綱（非依序），並持續到選角定裝、14 跨頁、PDF/EPUB/MP4 匯出。

- 後端：Python 3.10+、FastAPI、MoviePy、ReportLab、EbookLib
- AI：OpenAI API（從 `OPENAI_API_KEY` 環境變數讀取）。
- 串流：SSE（Server-Sent Events）。
- 視覺：亮色冒險 UI。

## Windows 一鍵啟動
1. 設定金鑰：`setx OPENAI_API_KEY "sk-xxxx"`（或複製 `.env.example` 成 `.env`）。
2. 於專案根目錄雙擊 `run_windows.bat`。
3. 開啟 `http://127.0.0.1:7860`。

## Mock 模式
無網路或測試：將 `.env` 內 `MOCK_OPENAI=1`，會以假資料/占位圖/簡易音效通過流程。

## 測試
```bash
python -m pytest -q
```
