import express from 'express';
import axios from 'axios';
import morgan from 'morgan';
import cors from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import tldts from 'tldts';

import { searchSerpApi } from './providers/serpapi.js';
import { searchGoogleCSE } from './providers/google_cse.js';
import { searchMock } from './providers/mock.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(morgan('dev'));
app.use(cors());
app.use(compression());
app.use(express.json());

const PORT = process.env.PORT || 8787;
const PROVIDER = String(process.env.PROVIDER || 'mock').toLowerCase();
const SERP_NUM = Number(process.env.SERP_NUM || 20);
const ROBOTS_FETCH_UA = process.env.ROBOTS_FETCH_UA || 'Mozilla/5.0 (compatible; AI-Discourse-Scanner/0.3; +https://example.org)';

function normalizeHostname(u) {
  try {
    if (u && !u.includes('http')) {
      return u.trim().replace(/\/$/, '').toLowerCase();
    }
    const url = new URL(u);
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function getHostParts(hostname) {
  try {
    const info = tldts.parse(hostname);
    const root = info.domain && info.publicSuffix ? info.domain + '.' + info.publicSuffix : hostname;
    const sub = info.subdomain ? info.subdomain + '.' + root : root;
    return { hostname: sub, rootDomain: root };
  } catch {
    return { hostname, rootDomain: hostname };
  }
}

app.get('/api/health', (req, res) => res.json({ ok: true, provider: PROVIDER }));

function weightByRank(r) { const rr = Number(r) || 999; return 1 / Math.log2(rr + 1); }

app.get('/api/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const num = Number(req.query.num || SERP_NUM);
    if (!q) return res.status(400).json({ error: 'Missing q' });

    let results = [];
    if (PROVIDER === 'serpapi') {
      results = await searchSerpApi(q, num, process.env.SERPAPI_KEY);
    } else if (PROVIDER === 'google_cse') {
      results = await searchGoogleCSE(q, num, process.env.GOOGLE_API_KEY, process.env.GOOGLE_CSE_CX);
    } else {
      results = await searchMock(q, num);
    }

    const annotated = results.map(r => {
      const hostname = normalizeHostname(r.url);
      let rootDomain = hostname;
      if (hostname) {
        const p = getHostParts(hostname);
        rootDomain = p.rootDomain;
      }
      return { ...r, hostname, rootDomain };
    }).filter(r => r.hostname);

    res.json({ q, provider: PROVIDER, results: annotated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

async function fetchRobotsOnce(proto, host) {
  const url = `${proto}://${host}/robots.txt`;
  try {
    const resp = await axios.get(url, {
      headers: { 'User-Agent': ROBOTS_FETCH_UA, 'Accept': 'text/plain,*/*;q=0.8' },
      timeout: 15000,
      validateStatus: () => true
    });
    const text = typeof resp.data === 'string' ? resp.data : (resp.data ? JSON.stringify(resp.data) : '');
    return {
      ok: true, status: resp.status, url,
      contentType: resp.headers['content-type'] || '',
      contentLength: Number(resp.headers['content-length'] || 0),
      text
    };
  } catch (e) {
    return { ok: false, url, error: e.message || String(e) };
  }
}

app.get('/api/robots', async (req, res) => {
  try {
    const domainParam = String(req.query.domain || req.query.host || req.query.url || '').trim();
    if (!domainParam) return res.status(400).json({ error: 'Missing domain/host/url' });
    const hostname = normalizeHostname(domainParam);
    if (!hostname) return res.status(400).json({ error: 'Invalid host' });

    let result = await fetchRobotsOnce('https', hostname);
    if (!(result.ok && (result.status === 200 || result.status === 404))) {
      const fallback = await fetchRobotsOnce('http', hostname);
      if (fallback.ok && (fallback.status === 200 || fallback.status === 404)) {
        result = fallback;
      } else if (!result.ok) {
        result = fallback;
      }
    }

    res.json({
      host: hostname, robots_url: result.url, status: result.status || 0, ok: result.ok === true,
      contentType: result.contentType || '', contentLength: result.contentLength || 0,
      text: result.text || '', error: result.error || null
    });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

// static
app.use('/', express.static(path.join(__dirname, '..', 'web')));

app.listen(PORT, () => {
  console.log(`AI Discourse Scanner v3 @ http://localhost:${PORT} (provider=${PROVIDER})`);
});
