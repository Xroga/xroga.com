interface TavilyResult {
  results: Array<{ title: string; url: string; content: string; score: number }>;
}

export async function tavilySearch(query: string, maxResults = 25): Promise<TavilyResult['results']> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error('TAVILY_API_KEY not configured');
  }

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
      include_answer: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily API error: ${response.status}`);
  }

  const data = (await response.json()) as TavilyResult;
  return data.results ?? [];
}
