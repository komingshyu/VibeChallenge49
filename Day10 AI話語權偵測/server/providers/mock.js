export async function searchMock(q, num) {
  const base = [
    { url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(q), title: q + ' - Wikipedia', snippet: 'Wikipedia entry for ' + q },
    { url: 'https://www.nytimes.com/search?query=' + encodeURIComponent(q), title: 'NYT - ' + q, snippet: 'Coverage and analysis' },
    { url: 'https://www.bbc.com/search?q=' + encodeURIComponent(q), title: 'BBC - ' + q, snippet: 'BBC results' },
    { url: 'https://www.theguardian.com/search?q=' + encodeURIComponent(q), title: 'The Guardian - ' + q, snippet: 'Guardian coverage' },
    { url: 'https://www.reddit.com/search/?q=' + encodeURIComponent(q), title: 'Reddit - ' + q, snippet: 'Community discussion' },
    { url: 'https://arxiv.org/search/?query=' + encodeURIComponent(q), title: 'arXiv - ' + q, snippet: 'Preprints' },
    { url: 'https://openai.com/', title: 'OpenAI', snippet: 'Company site' },
    { url: 'https://www.anthropic.com/', title: 'Anthropic', snippet: 'Company site' },
    { url: 'https://ai.google/', title: 'Google AI', snippet: 'Google AI homepage' },
    { url: 'https://help.openai.com/', title: 'OpenAI Help Center', snippet: 'Docs' }
  ];
  const N = Math.min(num || 15, base.length);
  return base.slice(0, N).map((it, idx) => ({ ...it, rank: idx+1, type:'organic' }));
}
