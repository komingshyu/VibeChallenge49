# AI Discourse Scanner v3（亮色版 + 響應式圖表）

- 亮色主題（非深色）。
- 視覺化 5 張圖（散點、Top10 話語權、Top10 AI 友善度、robots 狀態甜甜圈、AI 爬蟲決策分佈）。
- 圖表 **固定在容器內的高度**，並以 `maintainAspectRatio:false` 配合 CSS 控制，**不會超出螢幕**。
- 切換分頁或視窗縮放時會自動 `resize()`，避免隱藏容器導致圖表尺寸錯亂。
- 後端 `tldts` 改為 default 匯入，避免 CJS/ESM 命名匯入錯誤。
