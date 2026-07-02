/**
 * OSS Reserve — Mistral classifier, Zephyr mediator, TinyLlama validator, Phi-3 polisher.
 */

import { groqChat } from '../../lib/groq.js';
import { getSecret } from '../../config/envSecrets.js';
import {
  SWARM_CLASSIFIER_PROMPT,
  SWARM_PROPOSER_PROMPT,
  SWARM_CRITIC_PROMPT,
  SWARM_MEDIATOR_PROMPT,
  SWARM_VALIDATOR_PROMPT,
  SWARM_POLISHER_PROMPT,
} from '../../prompts/swarmReservePrompts.js';
import { phi3Polish } from '../../blackhole/phi3Polish.js';

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

async function validateAnswer(userInput: string, answer: string): Promise<boolean> {
  try {
    const verdict = await callBee(
      process.env.OLLAMA_VALIDATOR_MODEL ?? 'tinyllama',
      SWARM_VALIDATOR_PROMPT,
      `User query: ${userInput}\n\nAnswer:\n${answer.slice(0, 2000)}`,
      64
    );
    return /^pass\b/i.test(verdict.trim());
  } catch {
    return true;
  }
}

export async function classifyIntent(userInput: string): Promise<SwarmIntent> {
  try {
    const raw = await callBee(
      process.env.OLLAMA_CLASSIFIER_MODEL ?? 'mistral',
      SWARM_CLASSIFIER_PROMPT,
      userInput.slice(0, 500),
      16
    );
    const token = raw.trim().toLowerCase().split(/\s+/)[0];
    if (['greeting', 'stem', 'cultural', 'general', 'creation', 'coding', 'history', 'decision'].includes(token)) {
      if (token === 'coding' || token === 'stem') return 'stem';
      if (token === 'history' || token === 'cultural') return 'cultural';
      if (token === 'greeting') return 'greeting';
      if (token === 'decision') return 'general';
      return token as SwarmIntent;
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

/** Full reserve pipeline: Proposer → Critic → Zephyr Mediator → TinyLlama Validator → Phi-3 Polish */
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

  let merged: string;
  try {
    merged = await callBee(
      process.env.OLLAMA_MEDIATOR_MODEL ?? 'zephyr',
      SWARM_MEDIATOR_PROMPT,
      `User: ${userInput}\n\nDraft:\n${draft}\n\nCritique:\n${critique}`,
      1536
    );
  } catch {
    merged = draft;
  }

  const valid = await validateAnswer(userInput, merged);
  if (!valid) {
    try {
      merged = await callBee(
        process.env.OLLAMA_PROPOSER_MODEL ?? 'mistral',
        SWARM_PROPOSER_PROMPT,
        `${userInput}\n\n(Previous answer failed validation — answer directly, no fluff.)`,
        1536
      );
    } catch {
      /* keep merged */
    }
  }

  try {
    if (process.env.OLLAMA_URL || process.env.OLLAMA_ENABLED) {
      return await callBee(
        process.env.OLLAMA_POLISH_MODEL ?? 'phi3',
        SWARM_POLISHER_PROMPT,
        merged,
        1024
      );
    }
    return await phi3Polish(merged);
  } catch {
    return merged;
  }
}
