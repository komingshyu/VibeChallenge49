# 氧化還原王國 · Redox Kingdom

把氧化還原學成一場冒險。這是一個面向 **國二～高二** 學生的理化教學平台：劇情腳本 × 遊戲化學習 × 成就系統 × 互動視覺化 × 可分享憑證。

- 🧭 章節：序章、氧化數學院、半反應工坊、電池城（原電池）、電解監獄（電解）、腐蝕之海、王座試煉（Boss）。
- 🏆 成就：完成章節與連勝解鎖 XP、升級。
- 📱 RWD + PWA：響應式、支援安裝至主畫面（需以 HTTP 服務啟動）。
- 🔗 分享：原生分享（navigator.share）、X/Facebook/LINE 分享連結、成就憑證圖片下載。
- 💾 離線：進度與成就儲存於瀏覽器 localStorage。

## 一鍵啟動（建議）

- Windows：雙擊 `start.bat`
- macOS：雙擊 `start.command`（若遇權限問題，右鍵 > 打開）
- Linux：執行 `bash start.sh`

以上腳本會使用 Python 啟動本機 HTTP 伺服器並自動開啟 `http://localhost:8082`。若裝置無 Python，仍可直接雙擊 `index.html`（但 PWA 安裝與部分功能可能受限）。

## 目錄結構

```
oxidation-kingdom/
├─ index.html
├─ manifest.json
├─ sw.js
├─ README.md
├─ start.py
├─ start.bat
├─ start.command
├─ start.sh
└─ assets/
   ├─ css/style.css
   ├─ js/app.js
   └─ icons/
      ├─ icon-192.png
      ├─ icon-512.png
      ├─ maskable-512.png
      └─ social-card.png
```

## 教學對應（國二～高二）

- **基本**：氧化/還原定義、氧化數規則、原電池結構、電解與電鍍、腐蝕與防蝕。
- **中階**：半反應法配平（酸性為主）、E°cell 判斷自發、犧牲陽極選擇。
- **進階 Boss（少量）**：酸性配平 Fe²⁺/MnO₄⁻、由標準電位比較自發性、（延伸）法拉第定律口訣。

## 開發說明

- 純前端，無外部 CDN。所有教材與互動邏輯皆在 `assets/js/app.js` 中，易於擴充。
- 資料保存在本機；無伺服器端資料蒐集。

## 授權

MIT License – 自由修改、散佈，請保留版權聲明。
