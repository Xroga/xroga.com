import OpenAI from 'openai';
import { getSecret } from '../config/envSecrets.js';
import { MODELS, type ModelId } from './models.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResult {
  text: string;
  modelId: ModelId;
  apiModel: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

function clientFor(modelId: ModelId): OpenAI {
  const def = MODELS[modelId];
  const apiKey = getSecret(def.secretKey);
  if (!apiKey) {
    throw new Error(`${def.secretKey} is not configured on the server`);
  }
  return new OpenAI({
    apiKey,
    baseURL: def.baseUrl,
    timeout: 180_000,
    maxRetries: 1,
  });
}

export async function chatCompletion(
  modelId: ModelId,
  messages: ChatMessage[],
  opts: { maxTokens?: number; temperature?: number; json?: boolean } = {}
): Promise<ChatResult> {
  const def = MODELS[modelId];
  const client = clientFor(modelId);

  const completion = await client.chat.completions.create({
    model: def.apiModel,
    messages,
    max_tokens: opts.maxTokens ?? 8192,
    temperature: opts.temperature ?? 0.4,
    ...(opts.json ? { response_format: { type: 'json_object' as const } } : {}),
  });

  const choice = completion.choices[0]?.message;
  const text = (choice?.content ?? '').trim();
  const inputTokens = completion.usage?.prompt_tokens ?? estimateTokens(messages.map((m) => m.content).join('\n'));
  const outputTokens = completion.usage?.completion_tokens ?? estimateTokens(text);

  return {
    text,
    modelId,
    apiModel: def.apiModel,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

export function estimateTokens(text: string): number {
  // Rough heuristic — ~4 chars/token for mixed code+prose
  return Math.max(1, Math.ceil(text.length / 4));
}

export function modelKeyStatus(): Record<string, boolean> {
  return {
    KIMI_API_KEY: Boolean(getSecret('KIMI_API_KEY')),
    GLM_API_KEY: Boolean(getSecret('GLM_API_KEY')),
    DEEPSEEK_API_KEY: Boolean(getSecret('DEEPSEEK_API_KEY')),
    GROK_API_KEY: Boolean(getSecret('GROK_API_KEY') || getSecret('XAI_API_KEY')),
    TAVILY_API_KEY: Boolean(getSecret('TAVILY_API_KEY')),
  };
}
