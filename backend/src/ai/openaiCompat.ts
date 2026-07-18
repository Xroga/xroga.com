import OpenAI from 'openai';
import { getSecret } from '../config/envSecrets.js';
import {
  MODELS,
  OPENROUTER_BASE_URL,
  type ModelId,
} from './models.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
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

const GROK_OPENROUTER: Record<'grok_4_5' | 'grok_4_3', string> = {
  grok_4_5: 'x-ai/grok-4.5',
  grok_4_3: 'x-ai/grok-4.3',
};

function openRouterHeaders(): Record<string, string> {
  const referer = process.env.FRONTEND_URL || 'https://xroga.com';
  return {
    'HTTP-Referer': referer,
    'X-Title': 'Xroga AI Swarm',
  };
}

/**
 * Resolve API endpoint for a model.
 * DeepSeek / Kimi / GLM → OpenRouter (OPENROUTER_API_KEY) with optional native fallback.
 * Grok → xAI (GROK_API_KEY), then OpenRouter if xAI missing.
 */
export function resolveEndpoint(modelId: ModelId): ResolvedEndpoint {
  const def = MODELS[modelId];

  // OpenRouter-primary models (Kimi, GLM, DeepSeek)
  if (def.provider === 'openrouter') {
    const orKey = getSecret('OPENROUTER_API_KEY');
    if (orKey) {
      return {
        apiKey: orKey,
        baseUrl: OPENROUTER_BASE_URL,
        apiModel: def.apiModel,
        provider: 'openrouter',
        defaultHeaders: openRouterHeaders(),
      };
    }
    if (def.nativeFallback) {
      const nativeKey = getSecret(def.nativeFallback.secretKey);
      if (nativeKey) {
        return {
          apiKey: nativeKey,
          baseUrl: def.nativeFallback.baseUrl,
          apiModel: def.nativeFallback.apiModel,
          provider: def.nativeFallback.secretKey.replace('_API_KEY', '').toLowerCase(),
        };
      }
    }
    throw new Error(
      `OPENROUTER_API_KEY is not configured (required for ${def.apiModel}). ` +
        (def.nativeFallback
          ? `Optional native fallback ${def.nativeFallback.secretKey} also missing.`
          : 'No native DeepSeek key — DeepSeek runs only via OpenRouter.'),
    );
  }

  // Grok — prefer xAI, fall back to OpenRouter
  if (def.provider === 'xai') {
    const grokKey = getSecret('GROK_API_KEY') || getSecret('XAI_API_KEY');
    if (grokKey) {
      return {
        apiKey: grokKey,
        baseUrl: def.baseUrl,
        apiModel: def.apiModel,
        provider: 'xai',
      };
    }
    const orKey = getSecret('OPENROUTER_API_KEY');
    if (orKey && (modelId === 'grok_4_5' || modelId === 'grok_4_3')) {
      return {
        apiKey: orKey,
        baseUrl: OPENROUTER_BASE_URL,
        apiModel: GROK_OPENROUTER[modelId],
        provider: 'openrouter',
        defaultHeaders: openRouterHeaders(),
      };
    }
    throw new Error('GROK_API_KEY is not configured (OPENROUTER_API_KEY fallback also missing)');
  }

  // Generic native
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

export async function chatCompletion(
  modelId: ModelId,
  messages: ChatMessage[],
  opts: { maxTokens?: number; temperature?: number; json?: boolean } = {},
): Promise<ChatResult> {
  const endpoint = resolveEndpoint(modelId);
  const client = clientFor(endpoint);

  const completion = await client.chat.completions.create({
    model: endpoint.apiModel,
    messages,
    max_tokens: opts.maxTokens ?? 8192,
    temperature: opts.temperature ?? 0.4,
    ...(opts.json ? { response_format: { type: 'json_object' as const } } : {}),
  });

  const choice = completion.choices[0]?.message;
  const text = (choice?.content ?? '').trim();
  const inputTokens =
    completion.usage?.prompt_tokens ??
    estimateTokens(messages.map((m) => m.content).join('\n'));
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
    // DeepSeek is OpenRouter-only — surface readiness via OpenRouter
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
