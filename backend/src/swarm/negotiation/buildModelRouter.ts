/**
 * XROGA build model router — token-metered, cost-optimized.
 * DeepSeek Flash workhorse (~70%) | Grok strategy | Claude Sonnet polish | Opus rare QA
 */

import { getSecret } from '../../config/envSecrets.js';
import { XROGA_MODELS, type XrogaModelRole } from '../../config/modelRegistry.js';
import { publicModelLabel } from '../../config/xrogaPublicModels.js';
import { XROGA_USER_IDENTITY } from '../../prompts/xrogaIdentity.js';
import type { BuildUsageTracker } from '../../lib/buildUsageTracker.js';
import {
  canUseModelRole,
  resolveBuildModelRole,
  type BuildModelRole,
} from '../../phase1/modelQuotaTracker.js';

export type GrokVariant = 'reasoning' | 'fast';

/**
 * Default: Grok 4.3.
 * Strategic Grok 4.5 when caller opts in (and tracker cap allows).
 * Env XROGA_ALLOW_GROK_45=1 forces 4.5 for all Grok roles (ops override).
 */
export function pickGrokVariant(
  _seed = '',
  opts?: { preferFast?: boolean; allowGrok45?: boolean }
): GrokVariant {
  if (process.env.XROGA_ALLOW_GROK_45 === '1') return 'fast';
  if (opts?.preferFast && opts?.allowGrok45) return 'fast';
  return 'reasoning';
}

/** Resolve API model id — 4.5 only when explicitly allowed for this call. */
export function resolveGrokApiModel(variant: GrokVariant, allowGrok45 = false): string {
  const unlocked = allowGrok45 || process.env.XROGA_ALLOW_GROK_45 === '1';
  if (variant === 'fast' && unlocked) {
    return XROGA_MODELS.grok_fast.apiModel;
  }
  return XROGA_MODELS.grok_reasoning.apiModel;
}

export type { BuildModelRole } from '../../phase1/modelQuotaTracker.js';

const ROLE_MAP: Record<BuildModelRole, XrogaModelRole> = {
  flash: 'deepseek_flash',
  pro: 'deepseek_pro',
  grok: 'grok_reasoning',
  sonnet: 'claude_sonnet',
  opus: 'claude_opus',
};

const ROLE_LABEL: Record<BuildModelRole, string> = {
  flash: publicModelLabel('deepseek_flash'),
  pro: publicModelLabel('deepseek_pro'),
  grok: publicModelLabel('grok_reasoning'),
  sonnet: publicModelLabel('claude_sonnet'),
  opus: publicModelLabel('claude_opus'),
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
  maxTokens: number,
  opts?: { reasoning?: boolean }
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const apiKey = getSecret('DEEPSEEK_API_KEY');
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not configured');

  const sys = `${XROGA_USER_IDENTITY}\n\n${system}`;
  const useReasoning = opts?.reasoning ?? model.includes('v4-pro');
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
      ...(useReasoning ? { reasoning_effort: 'high' as const } : {}),
    }),
    signal: AbortSignal.timeout(useReasoning ? 120_000 : 90_000),
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
  maxTokens: number,
  variant: GrokVariant = 'reasoning',
  allowGrok45 = false
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const apiKey = getSecret('GROK_API_KEY') ?? getSecret('XAI_API_KEY');
  if (!apiKey) throw new Error('Grok API key not configured');

  let effectiveVariant = variant;
  if (effectiveVariant === 'fast' && !allowGrok45 && process.env.XROGA_ALLOW_GROK_45 !== '1') {
    effectiveVariant = 'reasoning';
  }

  const model = resolveGrokApiModel(effectiveVariant, allowGrok45);
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
      max_tokens: Math.min(maxTokens, effectiveVariant === 'fast' ? 4096 : 16384),
      temperature: effectiveVariant === 'fast' ? 0.35 : 0.4,
      ...(effectiveVariant === 'reasoning' ? { reasoning_effort: 'high' as const } : {}),
    }),
    signal: AbortSignal.timeout(effectiveVariant === 'fast' ? 45_000 : 90_000),
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
  tracker?: BuildUsageTracker,
  opts?: {
    userId?: string;
    claudeTask?: 'ui' | 'qa' | 'general';
    grokVariant?: GrokVariant;
    /** Permit Grok 4.5 for this call (still subject to maxGrok45Calls) */
    allowGrok45?: boolean;
    /** Hard cap of Grok 4.5 calls this build (default 1) */
    maxGrok45Calls?: number;
  }
): Promise<BuildModelResult> {
  const estimateIn = Math.ceil((system.length + user.length) / 4);
  const estimateOut = Math.min(maxTokens, 8192);
  role = await resolveBuildModelRole(opts?.userId, role, opts?.claudeTask ?? 'general', {
    input: estimateIn,
    output: estimateOut,
  });

  const want45 = Boolean(opts?.allowGrok45) || process.env.XROGA_ALLOW_GROK_45 === '1';
  const max45 = opts?.maxGrok45Calls ?? 1;
  const underCap = !tracker || tracker.canUseGrok45(max45);
  // Hard 2% Grok 4.5 sharePct — do not exceed allocated slice even when strategy wants it
  const grok45QuotaOk =
    !opts?.userId ||
    (await canUseModelRole(opts.userId, 'grok_fast', estimateIn, estimateOut));
  const allow45ThisCall = want45 && underCap && grok45QuotaOk;

  let grokVariant =
    opts?.grokVariant ??
    (role === 'grok'
      ? pickGrokVariant(user, { preferFast: allow45ThisCall, allowGrok45: allow45ThisCall })
      : 'reasoning');
  if (grokVariant === 'fast' && !allow45ThisCall) {
    grokVariant = 'reasoning';
  }
  // If Grok 4.3 slice is also exhausted, resolveBuildModelRole already remapped off 'grok'.
  if (role === 'grok' && grokVariant === 'reasoning' && opts?.userId) {
    const grok43Ok = await canUseModelRole(opts.userId, 'grok_reasoning', estimateIn, estimateOut);
    if (!grok43Ok) {
      role = await resolveBuildModelRole(opts.userId, 'pro', opts?.claudeTask ?? 'general', {
        input: estimateIn,
        output: estimateOut,
      });
    }
  }

  const label =
    role === 'grok'
      ? grokVariant === 'fast'
        ? publicModelLabel('grok_fast')
        : publicModelLabel('grok_reasoning')
      : ROLE_LABEL[role];
  const xrogaRole: XrogaModelRole =
    role === 'grok' ? (grokVariant === 'fast' ? 'grok_fast' : 'grok_reasoning') : ROLE_MAP[role];

  try {
    let result: { text: string; inputTokens: number; outputTokens: number };

    switch (role) {
      case 'flash':
        result = await deepseekCall(XROGA_MODELS[xrogaRole].apiModel, system, user, maxTokens, {
          reasoning: false,
        });
        break;
      case 'pro':
        result = await deepseekCall(XROGA_MODELS[xrogaRole].apiModel, system, user, maxTokens, {
          reasoning: true,
        });
        break;
      case 'grok':
        result = await grokCall(system, user, maxTokens, grokVariant, allow45ThisCall);
        break;
      case 'sonnet':
        result = await claudeCall(XROGA_MODELS.claude_sonnet.apiModel, system, user, maxTokens);
        break;
      case 'opus':
        result = await claudeCall(XROGA_MODELS.claude_opus.apiModel, system, user, Math.min(maxTokens, 4096));
        break;
    }

    tracker?.add(xrogaRole, result.inputTokens, result.outputTokens);
    // Bill immediately so dashboard reflects real API spend even if the build crashes later
    if (opts?.userId && tracker) {
      const delta = tracker.unbilledDelta();
      if (delta.length) {
        const input = delta.reduce((s, d) => s + d.inputTokens, 0);
        const output = delta.reduce((s, d) => s + d.outputTokens, 0);
        try {
          const { recordLlmUsage } = await import('../../phase1/usageRecorder.js');
          await recordLlmUsage(opts.userId, input, output, delta);
          tracker.markBilled(delta);
        } catch (billErr) {
          console.warn('[BuildModel] usage persist failed:', (billErr as Error).message?.slice(0, 120));
        }
      }
    }
    return { text: result.text, modelLabel: label, inputTokens: result.inputTokens, outputTokens: result.outputTokens };
  } catch (err) {
    console.warn(`[BuildModel] ${label} unavailable — DeepSeek Flash fallback:`, (err as Error).message?.slice(0, 120));
    const result = await deepseekCall(XROGA_MODELS.deepseek_flash.apiModel, system, user, maxTokens);
    tracker?.add('deepseek_flash', result.inputTokens, result.outputTokens);
    if (opts?.userId && tracker) {
      const delta = tracker.unbilledDelta();
      if (delta.length) {
        const input = delta.reduce((s, d) => s + d.inputTokens, 0);
        const output = delta.reduce((s, d) => s + d.outputTokens, 0);
        try {
          const { recordLlmUsage } = await import('../../phase1/usageRecorder.js');
          await recordLlmUsage(opts.userId, input, output, delta);
          tracker.markBilled(delta);
        } catch (billErr) {
          console.warn('[BuildModel] usage persist failed:', (billErr as Error).message?.slice(0, 120));
        }
      }
    }
    return {
      text: result.text,
      modelLabel: publicModelLabel('deepseek_flash'),
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    };
  }
}

export function modelActivityLine(modelLabel: string, action: string): string {
  return `[${modelLabel}] ${action}`;
}

function looksLikeUsefulCode(text: string): boolean {
  const t = text.trim();
  if (t.length < 80) return false;
  return /```|<html|<!DOCTYPE|function\s|const\s|export\s|class\s/.test(t);
}

/**
 * Escalating correction when user forces full repo read / heavy fix.
 * Flash → Pro → Grok → Sonnet (if Claude budget allows).
 */
export async function buildForcedCorrection(
  system: string,
  user: string,
  maxTokens = 16384,
  tracker?: BuildUsageTracker,
  opts?: { userId?: string; claudeTask?: 'ui' | 'qa' }
): Promise<BuildModelResult> {
  const chain: BuildModelRole[] = ['flash', 'pro', 'sonnet'];
  let last: BuildModelResult | null = null;

  for (const role of chain) {
    const result = await buildModelCall(role, system, user, maxTokens, tracker, {
      userId: opts?.userId,
      claudeTask: opts?.claudeTask ?? (role === 'sonnet' ? 'ui' : 'qa'),
    });
    last = result;
    if (looksLikeUsefulCode(result.text)) return result;
    if (role === 'sonnet' && result.modelLabel.includes('Flash')) {
      break;
    }
  }

  return last ?? (await buildModelCall('flash', system, user, maxTokens, tracker));
}
