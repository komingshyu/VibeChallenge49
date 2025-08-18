import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 8787;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

if (!OPENAI_API_KEY) {
  console.warn('[WARN] OPENAI_API_KEY 未設定，/api/reading 會回傳錯誤。');
}

// 靜態檔案
app.use(express.static(path.join(__dirname, 'public')));

/**
 * /api/reading
 * 前端送上：question, spread, drawnCards
 * 我們以 Chat Completions 串流回應解讀（將 delta.content 抽出，純文字 chunked 回傳）
 */
app.post('/api/reading', async (req, res) => {
  try {
    if (!OPENAI_API_KEY) {
      res.status(500);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('伺服器未設定 OPENAI_API_KEY');
      return;
    }

    const { question, spread, drawn } = req.body || {};
    if (!question || !spread || !Array.isArray(drawn)) {
      res.status(400);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('缺少必要參數：question / spread / drawn');
      return;
    }

    // 將抽到的牌整理成 prompt-friendly 的文字清單
    const lines = drawn.map((c, idx) => {
      const pos = spread.positions[idx]?.label || `第${idx + 1}張`;
      const orient = c.reversed ? '逆位' : '正位';
      const tag = c.arcana === 'major'
        ? `【大牌】${c.name}`
        : `【${c.suitZh} ${c.rankZh}】`;
      return `- 位置：${pos}｜${tag}｜${orient}`;
    }).join('\n');

    const spreadDesc = `${spread.name}（${spread.useWhen}）`;
    const sysPrompt = [
      '你是一位嚴謹且溫柔的塔羅占卜師，同時具備符號學、榮格原型、實務占卜經驗。',
      '你會以清晰、具同理且可操作的建議回應。',
      '請以繁體中文回答，條理分明，避免過度迷信語氣，強調自我覺察與行動指引。',
      '結構：',
      '1) 問題重述與釐清（如有模糊處，提出可能的詮釋路徑）',
      '2) 牌陣總覽（整體氣氛/元素比例/正逆位趨勢）',
      '3) 逐張牌義（說明原型、象徵、位置語境）',
      '4) 建議與行動清單（短句條列，聚焦可實踐）',
      '5) 注意事項（時限、盲點、若有逆位的調整方案）',
      '語氣溫暖而理性，不灌輸保證性承諾。'
    ].join('\n');

    const userPrompt =
`使用的牌陣：${spreadDesc}
提問：${question}

抽到的牌：
${lines}

請根據該牌陣位置含義進行脈絡化解讀；若為逆位，請解釋如何調整為有建設性的力量。`;

    // 與 OpenAI Chat Completions 串流
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        stream: true,
        temperature: 0.8,
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });

    if (!r.ok || !r.body) {
      const txt = await r.text().catch(() => '');
      res.status(500).setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(`OpenAI API 錯誤：${r.status} ${txt}`);
      return;
    }

    // 用 chunked 純文字將 delta.content 寫回前端
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    for await (const chunk of r.body) {
      buffer += decoder.decode(chunk, { stream: true });
      // OpenAI 以 SSE 格式傳回：多行 "data: {json}\n\n"
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';

      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith('data:')) continue;
        const data = line.replace(/^data:\s*/, '');
        if (data === '[DONE]') {
          res.end();
          return;
        }
        try {
          const j = JSON.parse(data);
          const delta = j.choices?.[0]?.delta?.content || '';
          if (delta) {
            res.write(delta); // 直接寫文字 token
          }
        } catch {
          // 忽略非 JSON 行
        }
      }
    }

    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('伺服器內部錯誤');
  }
});

app.listen(PORT, () => {
  console.log(`Tarot AI Reader running at http://localhost:${PORT}`);
});