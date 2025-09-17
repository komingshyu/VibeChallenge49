
# Backend（API / WebSocket）

- Node.js + TypeScript + Express
- Live BGP：RIS Live WebSocket（`wss://ris-live.ripe.net/v1/ws/`）
- Radar Outage：Cloudflare Radar API（需 `CLOUDFLARE_API_TOKEN`）
- M‑Lab：BigQuery 讀取 `measurement-lab.ndt.unified_*`（**可選**）
- USGS：台灣周邊 7 天地震事件
- Submarine Cable Map：`submarinecablemap.com/api/v3`（執行時抓取並快取，不再散布）

## 環境變數（.env）
```env
PORT=8787
NODE_ENV=development
CLOUDFLARE_API_TOKEN=
GCP_PROJECT_ID=
GOOGLE_APPLICATION_CREDENTIALS=
```

## 啟用 M‑Lab（可選）
若要啟用 BigQuery 查詢 M‑Lab NDT 公開資料，請執行：
```bat
scripts\enable-mlab.bat
```
之後設定 `backend\.env` 的 `GCP_PROJECT_ID` 與 `GOOGLE_APPLICATION_CREDENTIALS`（或使用 ADC）。
