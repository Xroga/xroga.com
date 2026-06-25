interface AnthropicContentBlock {
  type: string;
  text: string;
}

interface AnthropicResponse {
  content: AnthropicContentBlock[];
}

export async function claudeGenerate(
  systemPrompt: string,
  userPrompt: string,
  options?: { maxTokens?: number }
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: options?.maxTokens ?? 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${errText}`);
  }

  const data = (await response.json()) as AnthropicResponse;
  const textBlock = data.content.find((b) => b.type === 'text');
  return textBlock?.text ?? '';
}
