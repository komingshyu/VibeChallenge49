import axios from 'axios';

export async function searchSerpApi(q, num, apiKey) {
  if (!apiKey) throw new Error('SERPAPI_KEY missing');
  const params = { engine:'google', q, num: Math.min(Number(num)||20, 100), api_key: apiKey };
  const { data } = await axios.get('https://serpapi.com/search.json', { params, timeout:20000 });
  const results = [];
  const push = (items, type='organic') => {
    if (!Array.isArray(items)) return;
    items.forEach((it, idx) => {
      if (!it || !it.link) return;
      results.push({
        url: it.link,
        title: it.title || '',
        snippet: it.snippet || (it.snippet_highlighted_words||[]).join(' '),
        rank: it.position || results.length + 1,
        type
      });
    });
  };
  push(data.organic_results, 'organic');
  push(data.news_results, 'news');
  push(data.top_stories, 'top_stories');
  const seen = new Set(); const dedup = [];
  for (const r of results){ if (seen.has(r.url)) continue; seen.add(r.url); dedup.push(r); }
  dedup.forEach((r,i)=>{ if (!r.rank || isNaN(r.rank)) r.rank = i+1; });
  return dedup;
}
