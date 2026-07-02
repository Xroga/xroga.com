import { getSecret } from '../config/envSecrets.js';
import { API_ROLES, formatMinimalPrompt } from '../config/apiRoles.js';
import { XROGA_COUNCIL_BRIEF } from '../prompts/xrogaSystemManifest.js';
import { isGrokEnabled } from '../config/hybridConfig.js';

export async function grokGenerate(userInput: string): Promise<string> {
  const key = getSecret('XAI_API_KEY') ?? getSecret('GROK_API_KEY');
  if (!key) throw new Error('XAI_API_KEY not configured');
  const user = formatMinimalPrompt(API_ROLES.grok.minimalPromptTemplate, userInput);
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
        { role: 'system', content: `${XROGA_COUNCIL_BRIEF}\n\nYou are Grok Edge — devil's advocate.` },
        { role: 'user', content: user },
      ],
      max_tokens: API_ROLES.grok.maxOutputTokens,
      temperature: API_ROLES.grok.temperature,
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
