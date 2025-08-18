# SpaceTraverse v2 — 太空穿越飛行模擬器（擬真代理 + 隨機路線）

這個版本把 2D 照片從 3D 場景移除，改用 **3D 擬真代理模型**做主角（星系、雙星、三體、可居住帶行星、黑洞、星雲、彗星），NASA 高解析影像只在 **資訊面板**中顯示，避免「平貼照片」破壞沉浸感。另有 **種子化隨機路線**，每次載入隊形不同；可用 URL `?seed=12345` 固定路線。

## 執行
- 直接開啟 `start_server_windows.bat`。若遇 CORS 政策阻擋 `images-api.nasa.gov`，請用本機伺服器：
  - Python 3：`python -m http.server 8082` → `http://localhost:8082/`
  - Node：`npx serve` 或任何靜態伺服器

## 操作
- W/A/S/D 與滑鼠拖曳旋轉；滾輪縮放。
- 左上【新路線】會重抽 seed 與重建巡航曲線；品牌旁會顯示 `(seed=...)`。

## 檔案
- `index.html` — 三者：Three.js、HUD、資訊面板。
- `style.css` — 暗色 UI。
- `main.js` — 3D 代理模型工廠、隨機種子、NASA API（只供資訊卡）、自動巡航邏輯。
- `data/galaxies.json` — POI 清單（保留舊名以相容），包含多主題。

## 注意
- 這是**教育導覽風格**的擬真，不是 1:1 物理模擬；尺度、動力學皆為視覺化簡化。
- NASA 圖片多為公共領域，但 NASA 標誌不得用於背書或商標用途；單張圖片的標示以其頁面為準。
