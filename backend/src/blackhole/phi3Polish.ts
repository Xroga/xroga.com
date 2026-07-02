/** Optional Phi-3 mini polish via Ollama */

import { SWARM_POLISHER_PROMPT } from '../prompts/swarmReservePrompts.js';

export async function phi3Polish(text: string): Promise<string> {
  const instruction = `${SWARM_POLISHER_PROMPT}\n\n${text.slice(0, 3000)}`;
  const base = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';

  if (!process.env.OLLAMA_URL && !process.env.OLLAMA_ENABLED) {
    return text;
  }

  try {
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OLLAMA_POLISH_MODEL ?? 'phi3',
        messages: [{ role: 'user', content: instruction }],
        stream: false,
        options: { num_predict: 512, temperature: 0.4 },
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return text;
    const data = (await res.json()) as { message?: { content?: string } };
    const polished = data.message?.content?.trim();
    return polished && polished.length > 20 ? polished : text;
  } catch {
    return text;
  }
}
