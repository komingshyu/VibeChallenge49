import axios from 'axios';

export async function searchGoogleCSE(q, num, apiKey, cx) {
  if (!apiKey) throw new Error('GOOGLE_API_KEY missing');
  if (!cx) throw new Error('GOOGLE_CSE_CX missing');
  const N = Math.min(Number(num)||10, 10);
  const { data } = await axios.get('https://www.googleapis.com/customsearch/v1', {
    params: { key: apiKey, cx, q, num: N }, timeout:20000
  });
  const items = data.items || [];
  return items.map((it, idx) => ({
    url: it.link, title: it.title || '', snippet: it.snippet || '', rank: idx+1, type:'organic'
  }));
}
