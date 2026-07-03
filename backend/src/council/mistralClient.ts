/**
 * Mistral API — Co-Architect (backup executor & draft reviewer)
 */

import { getSecret } from '../config/envSecrets.js';
import { XROGA_USER_IDENTITY } from '../prompts/xrogaIdentity.js';

export async function mistralChat(
  system: string,
  user: string,
  options?: { maxTokens?: number; model?: string }
): Promise<string> {
  const key = getSecret('MISTRAL_API_KEY');
  if (!key) throw new Error('MISTRAL_API_KEY not configured');

  const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: options?.model ?? 'mistral-small-latest',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: options?.maxTokens ?? 2048,
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Mistral API ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim() ?? '';
  if (!text) throw new Error('Mistral returned empty');
  return text;
}

export async function mistralVerify(code: string, plan: string, prompt: string): Promise<string> {
  const { PHASE_4_MISTRAL_VERIFY } = await import('../swarm/negotiation/prompts.js');
  return mistralChat(
    `${XROGA_USER_IDENTITY}\n\n${PHASE_4_MISTRAL_VERIFY}`,
    `User request: ${prompt.slice(0, 500)}\n\nMaster Plan:\n${plan.slice(0, 2000)}\n\nCode:\n${code.slice(0, 8000)}`,
    { maxTokens: 512 }
  );
}
