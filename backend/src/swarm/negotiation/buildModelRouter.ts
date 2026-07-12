/**
 * XROGA build model router — token-metered, cost-optimized.
 * DeepSeek Flash workhorse (~70%) | Grok strategy | Claude Sonnet polish | Opus rare QA
 */

import { getSecret } from '../../config/envSecrets.js';
import { XROGA_MODELS, type XrogaModelRole } from '../../config/modelRegistry.js';
import { XROGA_USER_IDENTITY } from '../../prompts/xrogaIdentity.js';
import type { BuildUsageTracker } from '../../lib/buildUsageTracker.js';

export type BuildModelRole = 'flash' | 'pro' | 'grok' | 'sonnet' | 'opus';

const ROLE_MAP: Record<BuildModelRole, XrogaModelRole> = {
  flash: 'deepseek_flash',
  pro: 'deepseek_pro',
  grok: 'grok_reasoning',
  sonnet: 'claude_sonnet',
  opus: 'claude_opus',
};

const ROLE_LABEL: Record<BuildModelRole, string> = {
  flash: 'DeepSeek Flash',
  pro: 'DeepSeek Pro',
  grok: 'Grok Reasoning',
  sonnet: 'Claude Sonnet',
  opus: 'Claude Opus',
};

export interface BuildModelResult {
  text: string;
  modelLabel: string;
  inputTokens: number;
  outputTokens: number;
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

async function deepseekCall(
  model: string,
  system: string,
  user: string,
  maxTokens: number
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const apiKey = getSecret('DEEPSEEK_API_KEY');
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not configured');

  const sys = `${XROGA_USER_IDENTITY}\n\n${system}`;
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
      max_tokens: maxTokens,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(90_000),
  });

  if (!response.ok) throw new Error(`DeepSeek ${response.status}`);
  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = data.choices[0]?.message?.content?.trim() ?? '';
  return {
    text,
    inputTokens: data.usage?.prompt_tokens ?? estimateTokens(sys + user),
    outputTokens: data.usage?.completion_tokens ?? estimateTokens(text),
  };
}

async function grokCall(
  system: string,
  user: string,
  maxTokens: number
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const apiKey = getSecret('GROK_API_KEY') ?? getSecret('XAI_API_KEY');
  if (!apiKey) throw new Error('Grok API key not configured');

  const model = XROGA_MODELS.grok_reasoning.apiModel;
  const sys = `${XROGA_USER_IDENTITY}\n\n${system}`;
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
      max_tokens: Math.min(maxTokens, 8192),
      temperature: 0.4,
      reasoning_effort: 'high',
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) throw new Error(`Grok ${response.status}`);
  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = data.choices[0]?.message?.content?.trim() ?? '';
  if (!text) throw new Error('Grok empty');
  return {
    text,
    inputTokens: data.usage?.prompt_tokens ?? estimateTokens(sys + user),
    outputTokens: data.usage?.completion_tokens ?? estimateTokens(text),
  };
}

async function claudeCall(
  model: string,
  system: string,
  user: string,
  maxTokens: number
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const apiKey = getSecret('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const sys = `${XROGA_USER_IDENTITY}\n\n${system}`;
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: sys,
      messages: [{ role: 'user', content: user }],
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) throw new Error(`Claude ${response.status}`);
  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = data.content.find((b) => b.type === 'text')?.text?.trim() ?? '';
  return {
    text,
    inputTokens: data.usage?.input_tokens ?? estimateTokens(sys + user),
    outputTokens: data.usage?.output_tokens ?? estimateTokens(text),
  };
}

/** Run a build pass; records real token usage when tracker provided. */
export async function buildModelCall(
  role: BuildModelRole,
  system: string,
  user: string,
  maxTokens = 16384,
  tracker?: BuildUsageTracker
): Promise<BuildModelResult> {
  const label = ROLE_LABEL[role];
  const xrogaRole = ROLE_MAP[role];

  try {
    let result: { text: string; inputTokens: number; outputTokens: number };

    switch (role) {
      case 'flash':
      case 'pro':
        result = await deepseekCall(XROGA_MODELS[xrogaRole].apiModel, system, user, maxTokens);
        break;
      case 'grok':
        result = await grokCall(system, user, maxTokens);
        break;
      case 'sonnet':
        result = await claudeCall(XROGA_MODELS.claude_sonnet.apiModel, system, user, maxTokens);
        break;
      case 'opus':
        result = await claudeCall(XROGA_MODELS.claude_opus.apiModel, system, user, Math.min(maxTokens, 4096));
        break;
    }

    tracker?.add(xrogaRole, result.inputTokens, result.outputTokens);
    return { text: result.text, modelLabel: label, inputTokens: result.inputTokens, outputTokens: result.outputTokens };
  } catch (err) {
    console.warn(`[BuildModel] ${label} unavailable — DeepSeek Flash fallback:`, (err as Error).message?.slice(0, 120));
    const result = await deepseekCall(XROGA_MODELS.deepseek_flash.apiModel, system, user, maxTokens);
    tracker?.add('deepseek_flash', result.inputTokens, result.outputTokens);
    return {
      text: result.text,
      modelLabel: 'DeepSeek Flash',
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    };
  }
}

export function modelActivityLine(modelLabel: string, action: string): string {
  return `[${modelLabel}] ${action}`;
}
