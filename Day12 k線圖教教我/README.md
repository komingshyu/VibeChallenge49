# K線圖教教我（台股版，串流視覺解讀）

- 左側：K線圖 + 量能（上漲紅、下跌綠），**視覺特徵抽取**（含 bbox 疊圖）與 **SVG 術語小卡**。
- 右側：**視覺解讀主文（中文串流）**。
- 取數按鈕：📥 抓資料（預設 2330.TW；自動嘗試 .TW/.TWO）。
- 視覺解讀按鈕：🔍 串流視覺解讀（中文；模型預設 gpt-4o；金鑰走環境變數 `OPENAI_API_KEY`）。
- Streamlit deprecation 修正：所有 `st.image` 均改用 `use_container_width=True`。

