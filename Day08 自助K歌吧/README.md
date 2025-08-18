# 🎤 自助 K 歌吧（Demucs 版）

這是一個可上傳歌曲並自動「人聲 / 伴奏」分離的網頁應用。前端採用多彩時尚風格（非黑底），後端以 FastAPI 服務整合 Demucs 進行人聲分離。並提供即時 K 歌功能：麥克風錄音、混音、殘響/回聲、速度/變調（同時改變）等。

> **注意**：Demucs 與 PyTorch 對環境需求較高，請先確認你的機器具備 Python 3.10+，並依據你的作業系統與是否使用 GPU 安裝對應的 Torch 版本。

---

## 📦 專案結構

```
karaoke-studio-demucs/
├── backend/
│   ├── app.py                 # FastAPI 主程式與 API
│   ├── demucs_service.py      # 呼叫 Demucs 分離人聲/伴奏
│   └── requirements.txt       # 後端相依套件
├── frontend/
│   ├── index.html             # 單頁 App（多彩時尚風格）
│   ├── style.css              # 風格樣式
│   └── app.js                 # Web Audio + 互動邏輯
└── storage/                   # 後端輸出檔案（動態建立）
```

---

## 🚀 快速開始

1. **建立與啟動虛擬環境（建議）**
   ```bash
   cd karaoke-studio-demucs
   python -m venv .venv
   # Windows
   .venv\Scripts\activate
   # macOS / Linux
   source .venv/bin/activate
   ```

2. **安裝後端套件**
   ```bash
   pip install -r backend/requirements.txt
   ```
   > 若安裝 `torch` 速度慢或失敗，請依照你的系統到 PyTorch 官網查詢對應命令（CPU/GPU 版皆可）。

3. **啟動服務**
   ```bash
   uvicorn backend.app:app --reload --port 8000
   ```

4. **使用**
   - 瀏覽器開啟 `http://127.0.0.1:8000/`
   - 拖曳或選擇歌曲檔上傳（支援常見音訊格式）。
   - 等待分離完成後，介面會出現「原曲 / 清唱 / 伴奏」三個播放器，並可套用回聲、殘響、速度/變調、麥克風錄音等。
   - 可下載分離後的 `vocals.wav` 與 `no_vocals.wav`。

---

## 🧩 功能重點（K 歌吧）
- 上傳歌曲，一鍵分離「清唱」「伴奏」
- 三路播放器：原曲 / 清唱 / 伴奏
- 效果：回聲（Delay）、殘響（Convolver，內建合成 IR）、EQ（三段式）
- 速度/變調：以播放速率 *同時* 改變（不保真移調；如需高品質「保留節奏變調」，可改用前端專業 DSP 套件或在後端處理）
- 麥克風監聽與錄音（可與伴奏混音輸出）
- 下載清唱/伴奏，以及你自己的錄音
- 歌詞（LRC）上傳與即時高亮（簡易版）
- 歌曲佇列（前端管理，多首依序處理）

---

## ⚙️ 技術說明
- **人聲分離**：採用 Demucs（`htdemucs`，兩軌模式）。
- **程式參考**：`backend/demucs_service.py` 內部以命令列參數呼叫 Demucs 分離邏輯，並輸出 `vocals.wav` 與 `no_vocals.wav`。
- **前端音訊**：Web Audio API（Gain/Delay/Convolver/BiquadFilter/Analyser/MediaRecorder）。
- **檔案服務**：FastAPI 提供靜態檔案與 API。

---

## ❓常見問題
- **沒有 GPU 可以嗎？** 可以，但分離較慢。安裝 CPU 版 `torch` 即可。
- **分離速度很慢？** 第一次執行會下載模型（數百 MB）。之後會快一些。
- **想要專業級變調/校音/打分？** 可將後端延伸整合 SoX/RubberBand 等工具，或在前端導入專業 DSP 套件。

祝玩得開心！🎶