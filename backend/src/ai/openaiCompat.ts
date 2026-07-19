import OpenAI from 'openai';
import { getSecret } from '../config/envSecrets.js';
import {
  MODELS,
  OPENROUTER_BASE_URL,
  type ModelId,
} from './models.js';

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export interface ChatResult {
  text: string;
  modelId: ModelId;
  apiModel: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

interface ResolvedEndpoint {
  apiKey: string;
  baseUrl: string;
  apiModel: string;
  provider: string;
  defaultHeaders?: Record<string, string>;
}

function openRouterHeaders(): Record<string, string> {
  const referer = process.env.FRONTEND_URL || 'https://xroga.com';
  return {
    'HTTP-Referer': referer,
    'X-Title': 'Xroga AI Swarm',
  };
}

/**
 * Resolve API endpoint for a model.
 * - DeepSeek → OpenRouter ONLY (OPENROUTER_API_KEY)
 * - Kimi → Moonshot official (KIMI_API_KEY)
 * - GLM → Zhipu official (GLM_API_KEY)
 * - Grok → xAI official (GROK_API_KEY)
 */
export function resolveEndpoint(modelId: ModelId): ResolvedEndpoint {
  const def = MODELS[modelId];

  if (def.provider === 'openrouter') {
    const orKey = getSecret('OPENROUTER_API_KEY');
    if (!orKey) {
      throw new Error(
        `OPENROUTER_API_KEY is not configured (required for ${def.apiModel}). ` +
          'DeepSeek runs only via OpenRouter — DEEPSEEK_API_KEY is not used.',
      );
    }
    return {
      apiKey: orKey,
      baseUrl: OPENROUTER_BASE_URL,
      apiModel: def.apiModel,
      provider: 'openrouter',
      defaultHeaders: openRouterHeaders(),
    };
  }

  if (def.provider === 'xai') {
    const grokKey = getSecret('GROK_API_KEY') || getSecret('XAI_API_KEY');
    if (!grokKey) {
      throw new Error('GROK_API_KEY is not configured on the server');
    }
    return {
      apiKey: grokKey,
      baseUrl: def.baseUrl,
      apiModel: def.apiModel,
      provider: 'xai',
    };
  }

  const apiKey = getSecret(def.secretKey);
  if (!apiKey) {
    throw new Error(`${def.secretKey} is not configured on the server`);
  }
  return {
    apiKey,
    baseUrl: def.baseUrl,
    apiModel: def.apiModel,
    provider: def.provider,
  };
}

function clientFor(endpoint: ResolvedEndpoint): OpenAI {
  return new OpenAI({
    apiKey: endpoint.apiKey,
    baseURL: endpoint.baseUrl,
    timeout: 180_000,
    maxRetries: 1,
    defaultHeaders: endpoint.defaultHeaders,
  });
}

function contentTokenEstimate(content: string | ContentPart[]): number {
  if (typeof content === 'string') return estimateTokens(content);
  let n = 0;
  for (const part of content) {
    if (part.type === 'text') n += estimateTokens(part.text);
    // Rough vision token budget per image
    if (part.type === 'image_url') n += 1200;
  }
  return Math.max(1, n);
}

export async function chatCompletion(
  modelId: ModelId,
  messages: ChatMessage[],
  opts: { maxTokens?: number; temperature?: number; json?: boolean } = {},
): Promise<ChatResult> {
  const endpoint = resolveEndpoint(modelId);
  const client = clientFor(endpoint);

  const completion = await client.chat.completions.create({
    model: endpoint.apiModel,
    messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
    max_tokens: opts.maxTokens ?? 8192,
    temperature: opts.temperature ?? 0.4,
    ...(opts.json ? { response_format: { type: 'json_object' as const } } : {}),
  });

  const choice = completion.choices[0]?.message;
  const text = (choice?.content ?? '').trim();
  const inputTokens =
    completion.usage?.prompt_tokens ??
    messages.reduce((sum, m) => sum + contentTokenEstimate(m.content), 0);
  const outputTokens = completion.usage?.completion_tokens ?? estimateTokens(text);

  return {
    text,
    modelId,
    apiModel: endpoint.apiModel,
    provider: endpoint.provider,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

export async function chatCompletionStream(
  modelId: ModelId,
  messages: ChatMessage[],
  opts: {
    maxTokens?: number;
    temperature?: number;
    onDelta?: (delta: string) => void;
    signal?: AbortSignal;
  } = {},
): Promise<ChatResult> {
  const endpoint = resolveEndpoint(modelId);
  const client = clientFor(endpoint);

  if (opts.signal?.aborted) {
    const err = new Error('Build cancelled') as Error & { code?: string };
    err.code = 'BUILD_CANCELLED';
    throw err;
  }

  const stream = await client.chat.completions.create(
    {
      model: endpoint.apiModel,
      messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
      max_tokens: opts.maxTokens ?? 8192,
      temperature: opts.temperature ?? 0.4,
      stream: true,
    },
    opts.signal ? { signal: opts.signal } : undefined,
  );

  let text = '';
  let inputTokens = messages.reduce((sum, m) => sum + contentTokenEstimate(m.content), 0);
  let outputTokens = 0;

  for await (const chunk of stream) {
    if (opts.signal?.aborted) {
      const err = new Error('Build cancelled') as Error & { code?: string };
      err.code = 'BUILD_CANCELLED';
      throw err;
    }
    const delta = chunk.choices[0]?.delta?.content ?? '';
    if (delta) {
      text += delta;
      opts.onDelta?.(delta);
    }

    if (chunk.usage) {
      inputTokens = chunk.usage.prompt_tokens ?? inputTokens;
      outputTokens = chunk.usage.completion_tokens ?? outputTokens;
    }
  }

  text = text.trim();
  if (!outputTokens) {
    outputTokens = estimateTokens(text);
  }

  return {
    text,
    modelId,
    apiModel: endpoint.apiModel,
    provider: endpoint.provider,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

/** Build OpenAI-compatible multimodal user content (text + images). */
export function buildVisionUserContent(
  text: string,
  imageUrls: string[],
  detail: 'auto' | 'low' | 'high' = 'high',
): ContentPart[] {
  const parts: ContentPart[] = [{ type: 'text', text }];
  for (const url of imageUrls.slice(0, 4)) {
    parts.push({ type: 'image_url', image_url: { url, detail } });
  }
  return parts;
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function modelKeyStatus(): Record<string, boolean> {
  return {
    OPENROUTER_API_KEY: Boolean(getSecret('OPENROUTER_API_KEY')),
    KIMI_API_KEY: Boolean(getSecret('KIMI_API_KEY')),
    GLM_API_KEY: Boolean(getSecret('GLM_API_KEY')),
    GROK_API_KEY: Boolean(getSecret('GROK_API_KEY') || getSecret('XAI_API_KEY')),
    TAVILY_API_KEY: Boolean(getSecret('TAVILY_API_KEY')),
    DEEPSEEK_VIA_OPENROUTER: Boolean(getSecret('OPENROUTER_API_KEY')),
  };
}

/** Which transport each model will use with current env */
export function modelTransportStatus(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of Object.keys(MODELS) as ModelId[]) {
    try {
      const ep = resolveEndpoint(id);
      out[id] = `${ep.provider}:${ep.apiModel}`;
    } catch {
      out[id] = 'unconfigured';
    }
  }
  return out;
}
