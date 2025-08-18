# Tarot AI Reader

SVG 牌面 + 多牌陣 + OpenAI Chat Completions 串流解讀。

## 開發

```bash
npm install
cp .env.example .env  # 編輯 OPENAI_API_KEY
npm run dev
# http://localhost:8787
```

## 設計要點
- 單一 SVG 牌底模板 + 圖標覆疊，產生任意卡面。
- 逆位以 180° 旋轉呈現，並以徽記「正位 / 逆位」提示。
- 伺服器安全代理 OpenAI，前端僅拿到串流文字。
- 可於 `tarot-data.js` 擴充牌義或新增牌陣。
