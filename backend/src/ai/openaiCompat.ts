import OpenAI from 'openai';
import { getSecret } from '../config/envSecrets.js';
import {
  MODELS,
  OPENROUTER_BASE_URL,
  type ModelId,
} from './models.js';
import { recordModelExecution } from './providerRuntime.js';
import { withTemperatureFallback } from './temperatureCompat.js';

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
  providerRequestId?: string;
}

interface ResolvedEndpoint {
  apiKey: string;
  baseUrl: string;
  apiModel: string;
  provider: string;
  defaultHeaders?: Record<string, string>;
}

export function requireNonEmptyModelText(text: string, modelId: ModelId): string {
  const normalized = text.trim();
  if (normalized) return normalized;
  const error = new Error(`${modelId} returned an empty completion`) as Error & {
    code?: string;
  };
  error.code = 'EMPTY_PROVIDER_RESPONSE';
  throw error;
}

const MODEL_ID_ENV: Record<ModelId, string> = {
  kimi_k3: 'KIMI_MODEL_ID',
  glm_5_2: 'GLM_MODEL_ID',
  deepseek_v4_pro: 'DEEPSEEK_PRO_MODEL_ID',
  deepseek_v4_flash: 'DEEPSEEK_FLASH_MODEL_ID',
  grok_4_5: 'GROK_PRIMARY_MODEL_ID',
  grok_4_3: 'GROK_REVIEW_MODEL_ID',
};

export function configuredApiModel(modelId: ModelId): string {
  return process.env[MODEL_ID_ENV[modelId]]?.trim() || MODELS[modelId].apiModel;
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
export function resolveEndpoint(modelId: ModelId, credentialOverride?: string): ResolvedEndpoint {
  const def = MODELS[modelId];
  const apiModel = configuredApiModel(modelId);

  if (def.provider === 'openrouter') {
    const orKey = credentialOverride?.trim() || getSecret('OPENROUTER_API_KEY');
    if (!orKey) {
      throw new Error(
        `OPENROUTER_API_KEY is not configured (required for ${apiModel}). ` +
          'DeepSeek runs only via OpenRouter — DEEPSEEK_API_KEY is not used.',
      );
    }
    return {
      apiKey: orKey,
      baseUrl: OPENROUTER_BASE_URL,
      apiModel,
      provider: 'openrouter',
      defaultHeaders: openRouterHeaders(),
    };
  }

  if (def.provider === 'xai') {
    const grokKey =
      credentialOverride?.trim() || getSecret('GROK_API_KEY') || getSecret('XAI_API_KEY');
    if (!grokKey) {
      throw new Error('GROK_API_KEY is not configured on the server');
    }
    return {
      apiKey: grokKey,
      baseUrl: def.baseUrl,
      apiModel,
      provider: 'xai',
    };
  }

  const apiKey = credentialOverride?.trim() || getSecret(def.secretKey);
  if (!apiKey) {
    throw new Error(`${def.secretKey} is not configured on the server`);
  }
  return {
    apiKey,
    baseUrl: def.baseUrl,
    apiModel,
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
  opts: {
    maxTokens?: number;
    temperature?: number;
    json?: boolean;
    signal?: AbortSignal;
    credentialOverride?: string;
  } = {},
): Promise<ChatResult> {
  const started = Date.now();
  try {
    const endpoint = resolveEndpoint(modelId, opts.credentialOverride);
    const client = clientFor(endpoint);
    const completion = await withTemperatureFallback(opts.temperature ?? 0.4, (temperature) =>
      client.chat.completions.create(
        {
          model: endpoint.apiModel,
          messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
          max_tokens: opts.maxTokens ?? 8192,
          ...(temperature === undefined ? {} : { temperature }),
          ...(opts.json ? { response_format: { type: 'json_object' as const } } : {}),
        },
        opts.signal ? { signal: opts.signal } : undefined,
      ),
    );
    const choice = completion.choices[0]?.message;
    const text = requireNonEmptyModelText(choice?.content ?? '', modelId);
    const inputTokens =
      completion.usage?.prompt_tokens ??
      messages.reduce((sum, m) => sum + contentTokenEstimate(m.content), 0);
    const outputTokens = completion.usage?.completion_tokens ?? estimateTokens(text);
    recordModelExecution(modelId, { ok: true, latencyMs: Date.now() - started });
    return {
      text,
      modelId,
      apiModel: endpoint.apiModel,
      provider: endpoint.provider,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      providerRequestId: completion.id,
    };
  } catch (error) {
    recordModelExecution(modelId, { ok: false, latencyMs: Date.now() - started, error });
    throw error;
  }
}

export async function chatCompletionStream(
  modelId: ModelId,
  messages: ChatMessage[],
  opts: {
    maxTokens?: number;
    temperature?: number;
    onDelta?: (delta: string) => void;
    signal?: AbortSignal;
    credentialOverride?: string;
  } = {},
): Promise<ChatResult> {
  const started = Date.now();
  try {
    const endpoint = resolveEndpoint(modelId, opts.credentialOverride);
    const client = clientFor(endpoint);
    if (opts.signal?.aborted) {
      const err = new Error('Build cancelled') as Error & { code?: string };
      err.code = 'BUILD_CANCELLED';
      throw err;
    }
    // Some models refuse any temperature but their own default and answer 400.
    // Retry once without the parameter rather than losing the run to it.
    const stream = await withTemperatureFallback(opts.temperature ?? 0.4, (temperature) =>
      client.chat.completions.create(
        {
          model: endpoint.apiModel,
          messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
          max_tokens: opts.maxTokens ?? 8192,
          ...(temperature === undefined ? {} : { temperature }),
          stream: true,
        },
        opts.signal ? { signal: opts.signal } : undefined,
      ),
    );

    let text = '';
    let providerRequestId: string | undefined;
    let inputTokens = messages.reduce((sum, m) => sum + contentTokenEstimate(m.content), 0);
    let outputTokens = 0;

    for await (const chunk of stream) {
      providerRequestId ??= chunk.id;
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

    text = requireNonEmptyModelText(text, modelId);
    if (!outputTokens) outputTokens = estimateTokens(text);

    recordModelExecution(modelId, { ok: true, latencyMs: Date.now() - started });
    return {
      text,
      modelId,
      apiModel: endpoint.apiModel,
      provider: endpoint.provider,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      providerRequestId,
    };
  } catch (error) {
    recordModelExecution(modelId, { ok: false, latencyMs: Date.now() - started, error });
    throw error;
  }
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

export function estimateMessageTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, message) => sum + contentTokenEstimate(message.content), 0);
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
