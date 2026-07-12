import { XROGA_MODELS } from '../config/modelRegistry.js';
import { getSecret } from '../config/envSecrets.js';

interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface DeepSeekResponse {
  choices: Array<{ message: { content: string } }>;
}

export async function deepSeekChat(
  messages: DeepSeekMessage[],
  options?: { model?: string; maxTokens?: number }
): Promise<string> {
  const apiKey = getSecret('DEEPSEEK_API_KEY');
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY not configured');
  }

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: options?.model ?? XROGA_MODELS.deepseek_flash.apiModel,
      messages,
      max_tokens: options?.maxTokens ?? 1024,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`DeepSeek API error: ${response.status} ${errText}`);
  }

  const data = (await response.json()) as DeepSeekResponse;
  return data.choices[0]?.message?.content ?? '';
}
