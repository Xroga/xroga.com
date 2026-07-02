/**
 * OSS Reserve — Ollama bees with Groq fallback when local models unavailable.
 */

import { groqChat } from '../../lib/groq.js';
import { getSecret } from '../../config/envSecrets.js';
import {
  SWARM_CLASSIFIER_PROMPT,
  SWARM_PROPOSER_PROMPT,
  SWARM_CRITIC_PROMPT,
  SWARM_MEDIATOR_PROMPT,
} from '../../prompts/swarmReservePrompts.js';

export type SwarmIntent = 'greeting' | 'stem' | 'cultural' | 'general' | 'creation';

async function callOllama(model: string, system: string, user: string, maxTokens: number): Promise<string> {
  const base = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      stream: false,
      options: { num_predict: maxTokens },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`Ollama ${model}: ${res.status}`);
  const data = (await res.json()) as { message?: { content?: string } };
  const text = data.message?.content ?? '';
  if (!text.trim()) throw new Error(`Ollama ${model} empty`);
  return text.trim();
}

async function callBee(
  ollamaModel: string,
  system: string,
  user: string,
  maxTokens: number
): Promise<string> {
  if (process.env.OLLAMA_URL || process.env.OLLAMA_ENABLED) {
    try {
      return await callOllama(ollamaModel, system, user, maxTokens);
    } catch (err) {
      console.warn(`[SwarmReserve] Ollama ${ollamaModel}:`, (err as Error).message.slice(0, 80));
    }
  }

  if (getSecret('GROQ_API_KEY')) {
    const text = await groqChat(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      { maxTokens }
    );
    if (text.trim()) return text.trim();
  }

  throw new Error('No OSS reserve provider available');
}

export async function classifyIntent(userInput: string): Promise<SwarmIntent> {
  try {
    const raw = await callBee(
      process.env.OLLAMA_CLASSIFIER_MODEL ?? 'mistral',
      SWARM_CLASSIFIER_PROMPT,
      userInput.slice(0, 500),
      128
    );
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as { intent?: string };
      const intent = parsed.intent ?? 'general';
      if (['greeting', 'stem', 'cultural', 'general', 'creation'].includes(intent)) {
        return intent as SwarmIntent;
      }
    }
  } catch {
    /* heuristic below */
  }

  const lower = userInput.toLowerCase();
  if (/^(hi|hello|hey|good\s+(morning|afternoon|evening))\b/.test(lower)) return 'greeting';
  if (/\b(code|math|algorithm|debug|python|javascript|api|function)\b/.test(lower)) return 'stem';
  if (/\b(history|culture|art|religion|philosophy|who was|when did)\b/.test(lower)) return 'cultural';
  if (/\b(generate|create|build|make|design)\b/.test(lower)) return 'creation';
  return 'general';
}

/** Full reserve pipeline: Proposer → Critic → Mediator */
export async function swarmReserveProcess(userInput: string): Promise<string> {
  const draft = await callBee(
    process.env.OLLAMA_PROPOSER_MODEL ?? 'mistral',
    SWARM_PROPOSER_PROMPT,
    userInput,
    1536
  );

  let critique = '';
  try {
    critique = await callBee(
      process.env.OLLAMA_CRITIC_MODEL ?? 'llama3.2',
      SWARM_CRITIC_PROMPT,
      `User: ${userInput}\n\nDraft:\n${draft}`,
      768
    );
  } catch {
    return draft;
  }

  try {
    return await callBee(
      process.env.OLLAMA_MEDIATOR_MODEL ?? 'phi3',
      SWARM_MEDIATOR_PROMPT,
      `User: ${userInput}\n\nDraft:\n${draft}\n\nCritique:\n${critique}`,
      1536
    );
  } catch {
    return draft;
  }
}
