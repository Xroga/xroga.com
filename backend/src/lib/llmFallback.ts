import OpenAI from 'openai';
import { claudeGenerate } from './anthropic.js';
import { deepSeekChat } from './deepseek.js';
import { groqChat } from './groq.js';
import { geminiGenerate } from './gemini.js';
import { logSystemError } from '../services/systemErrorLog.js';

export type LlmProvider =
  | 'openai'
  | 'anthropic'
  | 'deepseek'
  | 'groq'
  | 'gemini'
  | 'replicate'
  | 'ollama';

const DEFAULT_LLM_CHAIN: LlmProvider[] = [
  'openai',
  'anthropic',
  'deepseek',
  'groq',
  'gemini',
  'ollama',
];

function getOpenAI(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  return key ? new OpenAI({ apiKey: key }) : null;
}

async function callOpenAI(system: string, user: string, maxTokens: number): Promise<string> {
  const openai = getOpenAI();
  if (!openai) throw new Error('OPENAI_API_KEY not configured');
  const res = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: maxTokens,
    temperature: 0.4,
  });
  const text = res.choices[0]?.message?.content ?? '';
  if (!text.trim()) throw new Error('OpenAI returned empty response');
  return text.trim();
}

async function callAnthropic(system: string, user: string, maxTokens: number): Promise<string> {
  const text = await claudeGenerate(system, user, { maxTokens });
  if (!text.trim()) throw new Error('Anthropic returned empty response');
  return text.trim();
}

async function callDeepSeek(system: string, user: string, maxTokens: number): Promise<string> {
  const text = await deepSeekChat(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { model: 'deepseek-chat', maxTokens }
  );
  if (!text.trim()) throw new Error('DeepSeek returned empty response');
  return text.trim();
}

async function callGroq(system: string, user: string, maxTokens: number): Promise<string> {
  const text = await groqChat(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { maxTokens }
  );
  if (!text.trim()) throw new Error('Groq returned empty response');
  return text.trim();
}

async function callGemini(system: string, user: string, maxTokens: number): Promise<string> {
  const text = await geminiGenerate(system, user, { model: 'gemini-1.5-pro', maxTokens });
  if (!text.trim()) throw new Error('Gemini returned empty response');
  return text.trim();
}

async function callOllama(system: string, user: string, maxTokens: number): Promise<string> {
  const base = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL ?? 'llama3.2',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      stream: false,
      options: { num_predict: maxTokens },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const data = (await res.json()) as { message?: { content?: string } };
  const text = data.message?.content ?? '';
  if (!text.trim()) throw new Error('Ollama returned empty response');
  return text.trim();
}

const PROVIDER_CALLS: Record<
  LlmProvider,
  (system: string, user: string, maxTokens: number) => Promise<string>
> = {
  openai: callOpenAI,
  anthropic: callAnthropic,
  deepseek: callDeepSeek,
  groq: callGroq,
  gemini: callGemini,
  replicate: callDeepSeek,
  ollama: callOllama,
};

function isProviderConfigured(provider: LlmProvider): boolean {
  switch (provider) {
    case 'openai':
      return Boolean(process.env.OPENAI_API_KEY);
    case 'anthropic':
      return Boolean(process.env.ANTHROPIC_API_KEY);
    case 'deepseek':
      return Boolean(process.env.DEEPSEEK_API_KEY);
    case 'groq':
      return Boolean(process.env.GROQ_API_KEY);
    case 'gemini':
      return Boolean(process.env.GEMINI_API_KEY);
    case 'replicate':
      return Boolean(process.env.REPLICATE_API_TOKEN);
    case 'ollama':
      return Boolean(process.env.OLLAMA_URL ?? process.env.OLLAMA_ENABLED);
    default:
      return false;
  }
}

export interface LlmFallbackOptions {
  chain?: LlmProvider[];
  maxTokens?: number;
  userId?: string;
  runId?: string;
  apiType?: string;
}

/** Direct provider loop — no circuit breaker (same pattern as imageGen). */
export async function callWithLlmFallback(
  system: string,
  user: string,
  options?: LlmFallbackOptions
): Promise<{ text: string; provider: string }> {
  const chain = options?.chain ?? DEFAULT_LLM_CHAIN;
  const maxTokens = options?.maxTokens ?? 2048;

  for (const provider of chain) {
    if (!isProviderConfigured(provider)) continue;
    try {
      const text = await PROVIDER_CALLS[provider](system, user, maxTokens);
      return { text, provider };
    } catch (err) {
      await logSystemError({
        api: provider,
        errorMessage: (err as Error).message,
        fallbackUsed: 'trying next LLM provider',
        severity: 'warning',
        userId: options?.userId,
        runId: options?.runId,
        metadata: { apiType: options?.apiType ?? 'llm' },
      });
    }
  }

  return {
    text: JSON.stringify({
      title: user.slice(0, 80),
      mood: 'cinematic',
      scenes: [
        {
          scene_id: '1',
          location: 'EXT. UNKNOWN',
          characters: ['Narrator'],
          dialogue: user.slice(0, 200),
          action: user,
          durationSeconds: 5,
          priority: 'critical',
        },
      ],
    }),
    provider: 'heuristic-fallback',
  };
}
