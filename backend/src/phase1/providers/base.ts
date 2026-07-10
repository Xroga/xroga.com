import { getSecret } from '../../config/envSecrets.js';
import type { InternalModelId } from '../types.js';
import { MODELS } from '../models.js';
import type { ModelCallResult } from '../types.js';

const REQUEST_TIMEOUT_MS = 30_000;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CallOptions {
  systemPrompt?: string;
  messages: ChatMessage[];
  maxTokens?: number;
  reasoningEffort?: 'high';
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

async function callDeepSeek(
  modelId: InternalModelId,
  options: CallOptions
): Promise<ModelCallResult> {
  const apiKey = getSecret('DEEPSEEK_API_KEY');
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not configured');

  const config = MODELS[modelId];
  const messages: ChatMessage[] = options.systemPrompt
    ? [{ role: 'system', content: options.systemPrompt }, ...options.messages]
    : options.messages;

  const response = await fetchWithTimeout('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.apiModel,
      messages,
      max_tokens: options.maxTokens ?? 4096,
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`DeepSeek error ${response.status}: ${errText}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const content = data.choices[0]?.message?.content ?? '';
  const inputTokens = data.usage?.prompt_tokens ?? estimateTokens(JSON.stringify(messages));
  const outputTokens = data.usage?.completion_tokens ?? estimateTokens(content);

  return { content, inputTokens, outputTokens, modelId };
}

async function callGrok(modelId: InternalModelId, options: CallOptions): Promise<ModelCallResult> {
  const apiKey = getSecret('GROK_API_KEY') ?? getSecret('XAI_API_KEY');
  if (!apiKey) throw new Error('GROK_API_KEY not configured');

  const config = MODELS[modelId];
  const messages: ChatMessage[] = options.systemPrompt
    ? [{ role: 'system', content: options.systemPrompt }, ...options.messages]
    : options.messages;

  const body: Record<string, unknown> = {
    model: config.apiModel,
    messages,
    max_tokens: options.maxTokens ?? 4096,
    temperature: 0.5,
  };
  if (options.reasoningEffort === 'high') {
    body.reasoning_effort = 'high';
  }

  const response = await fetchWithTimeout('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Grok error ${response.status}: ${errText}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const content = data.choices[0]?.message?.content ?? '';
  const inputTokens = data.usage?.prompt_tokens ?? estimateTokens(JSON.stringify(messages));
  const outputTokens = data.usage?.completion_tokens ?? estimateTokens(content);

  return { content, inputTokens, outputTokens, modelId };
}

async function callAnthropic(
  modelId: InternalModelId,
  options: CallOptions
): Promise<ModelCallResult> {
  const apiKey = getSecret('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const config = MODELS[modelId];
  const userContent = options.messages
    .filter((m) => m.role !== 'system')
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n\n');

  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.apiModel,
      max_tokens: options.maxTokens ?? 4096,
      system: options.systemPrompt ?? 'You are Xroga AI, a helpful software development assistant.',
      messages: [{ role: 'user', content: (userContent || options.messages.at(-1)?.content) ?? '' }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic error ${response.status}: ${errText}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  const content = data.content.find((b) => b.type === 'text')?.text ?? '';
  const inputTokens = data.usage?.input_tokens ?? estimateTokens(userContent);
  const outputTokens = data.usage?.output_tokens ?? estimateTokens(content);

  return { content, inputTokens, outputTokens, modelId };
}

export async function callModel(
  modelId: InternalModelId,
  options: CallOptions
): Promise<ModelCallResult> {
  const config = MODELS[modelId];

  try {
    switch (config.provider) {
      case 'deepseek':
        return await callDeepSeek(modelId, options);
      case 'xai':
        return await callGrok(modelId, options);
      case 'anthropic':
        return await callAnthropic(modelId, options);
      default:
        throw new Error(`Unknown provider for ${modelId}`);
    }
  } catch (err) {
    const fallback = config.fallback;
    if (fallback && fallback !== modelId) {
      const { phase1Logger } = await import('../logger.js');
      phase1Logger.warn('Model call failed, using fallback', {
        modelId,
        fallback,
        error: (err as Error).message,
      });
      return callModel(fallback, options);
    }
    throw err;
  }
}
