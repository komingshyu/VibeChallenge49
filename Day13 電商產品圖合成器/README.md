# 電商產品圖合成器 (GPT‑4o + Responses API)

一個明亮、時尚、免安裝建置工具鏈的影像合成小工具：
- **場景變化**：在既有產品圖上，透過文字說明生成新場景（使用 **Responses API + GPT‑4o** 的影像生成功能）。
- **與指定人物合成**：上傳人物照與產品圖，生成人物實際使用產品的情境。
- **解析度提升**：支援 **Real‑ESRGAN x4 (ONNX)** 超解析度，任務完成後可勾選自動放大，或獨立使用。
- **批次處理**：支援單張、整個資料夾（前端 *folder upload*），後端具備 API 限速與併發控制。

> ✅ 本專案使用 **OpenAI Responses API** 以「對話上下文」方式驅動影像生成，而非舊式 Images 文生圖端點。  
> ✅ `OPENAI_API_KEY` 直接從環境變數讀取。

---

## 一鍵啟動

> 需求：Python 3.10+

1. 建立虛擬環境並啟動服務：

```bash
# macOS / Linux
./start.sh
```

```bat
:: Windows
start.bat
```

2. 確認環境變數：
```bash
export OPENAI_API_KEY=sk-xxxx
```

3. 打開前端：
- 服務啟動後預設在 <http://127.0.0.1:8000>，自動提供靜態頁面（明亮 UI）。

> 如果你有 Real-ESRGAN 的 ONNX 權重檔，請放到：`app/weights/real_esrgan_x4.onnx`。

---

## 目錄結構
```
ecom-image-compositor/
├── README.md
├── start.sh
├── start.bat
├── requirements.txt
├── .env.example
└── app/
    ├── server.py
    ├── services/
    │   ├── openai_image.py
    │   └── upscale.py
    ├── utils/
    │   ├── rate_limiter.py
    │   └── io_helpers.py
    ├── data/
    │   ├── inputs/
    │   └── outputs/
    ├── weights/
    │   └── (real_esrgan_x4.onnx 放這裡)
    └── web/
        ├── index.html
        ├── css/
        │   └── style.css
        └── js/
            └── app.js
```

---

## 功能說明

### 1) 場景變化（Scene Edit）
- 上傳產品圖 + 輸入場景描述（例如：「讓一個台灣年輕美女拿著他喝熱飲」、「小精靈坐在杯緣」）。
- 以 Responses API 呼叫 **image_generation** 工具；輸入除了文字，也把產品圖作為 `input_image` 一併提供，讓模型以「編輯 / 合成」思維工作。

### 2) 人物合成（Person Composite）
- 上傳人物照 + 產品圖 + 指令（姿勢/情緒/角度等）。
- 同樣走 Responses API，將兩張輸入圖都傳給模型，要求合成自然、光影一致的商用情境。

### 3) 解析度提升（Upscale）
- 使用 **ONNXRuntime** 載入 `real_esrgan_x4.onnx`。
- 可獨立上傳一張圖放大，也可在上述兩種任務勾選「完成後自動 4× 放大」。

### 4) 批次處理（Batch）
- 前端支援 **整個資料夾上傳**（`<input webkitdirectory>`）。
- 後端使用 **併發閘門 + 最小間隔 + 指數退避**，緩解 API 限速（429）。
- 可指定 `max_concurrency` 與 `min_interval_ms`。

---

## 開發重點

- **Responses API（圖像工具）**  
  我們以 `client.responses.create(..., tools=[{"type":"image_generation"}])` 呼叫；輸入包含：
  - `input_text`：你的自然語言需求。
  - `input_image`：產品圖 &（可選）人物照（Base64 data URL）。
  - 解析回傳的 `image_generation_call` 結果抓取 base64 影像。

- **速率限制**  
  參考官方說明並加上退避機制。可在 `utils/rate_limiter.py` 調整。

- **隱私與合規**  
  若使用真人照片，請事前取得授權並遵守平台與地方法規，詳見下方注意事項。

---

## 注意事項（肖像權 / 商用合規）
- 僅使用你有權利的產品圖與人物照。
- 請遵守各國肖像權、個資與商標法規。
- 對名人、未成年人或敏感場景請格外審慎，必要時加入使用者確認流程（本專案前端已提供授權勾選欄位示意）。

---

## 參考
- OpenAI **Responses API** 與影像工具（官方文件）：
  - 圖像生成功能與工具用法（包含 `tools: [{type: "image_generation"}]` 與 `image_generation_call` 事件）
  - 以 `input_image`（`image_url`）提供影像輸入
  - 模型：**GPT‑4o**
- Rate limits 與最佳實務

> 文件連結可於 UI 下方「說明」區塊點開。

---

## 授權
MIT
