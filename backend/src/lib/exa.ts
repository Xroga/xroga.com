interface ExaResult {
  results: Array<{ title: string; url: string; text?: string; publishedDate?: string }>;
}

export async function exaSearch(query: string, numResults = 25): Promise<ExaResult['results']> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    throw new Error('EXA_API_KEY not configured');
  }

  const response = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      query,
      numResults,
      type: 'auto',
      contents: { text: { maxCharacters: 3000 } },
    }),
  });

  if (!response.ok) {
    throw new Error(`Exa API error: ${response.status}`);
  }

  const data = (await response.json()) as ExaResult;
  return data.results ?? [];
}
