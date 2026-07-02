import { getSecret } from '../config/envSecrets.js';
import { GROK_EDGE_PROMPT } from '../prompts/councilPrompts.js';
import { isGrokEnabled } from '../config/hybridConfig.js';

/** Optional xAI Grok — uses OpenAI-compatible API when XAI_API_KEY is set */
export async function grokGenerate(userInput: string): Promise<string> {
  const key = getSecret('XAI_API_KEY') ?? getSecret('GROK_API_KEY');
  if (!key) throw new Error('XAI_API_KEY not configured');
  const base = process.env.XAI_API_BASE ?? 'https://api.x.ai/v1';
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: process.env.XAI_MODEL ?? 'grok-2-latest',
      messages: [
        { role: 'system', content: GROK_EDGE_PROMPT },
        { role: 'user', content: userInput },
      ],
      max_tokens: 1024,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Grok API ${res.status}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text.trim()) throw new Error('Grok returned empty');
  return text.trim();
}

export function grokAvailable(): boolean {
  return isGrokEnabled();
}
