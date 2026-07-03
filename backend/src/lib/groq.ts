import { getSecret } from '../config/envSecrets.js';

interface GroqResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export async function groqChat(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options?: { model?: string; maxTokens?: number }
): Promise<string> {
  const apiKey = getSecret('GROQ_API_KEY');
  if (!apiKey) {
    throw new Error('GROQ_API_KEY not configured');
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: options?.model ?? 'llama-3.3-70b-versatile',
      messages,
      max_tokens: options?.maxTokens ?? 512,
      temperature: 0.6,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error: ${response.status} ${errText.slice(0, 200)}`);
  }

  const data = (await response.json()) as GroqResponse;
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}
