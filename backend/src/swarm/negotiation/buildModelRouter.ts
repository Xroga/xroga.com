/**
 * XROGA build model router — cost-optimized, high quality.
 * Flash: Groq/DeepSeek | Pro: DeepSeek | Planning: Grok reasoning | UI: Claude Sonnet | QA: DeepSeek Pro (Opus rare)
 */

import { deepSeekChat } from '../../lib/deepseek.js';
import { groqChat } from '../../lib/groq.js';
import { claudeGenerateWithModel } from '../../lib/anthropic.js';
import { deepseekGenerate } from '../../council/deepseekClient.js';
import { XROGA_USER_IDENTITY } from '../../prompts/xrogaIdentity.js';
import { getSecret } from '../../config/envSecrets.js';
import { deepseekCode, groqCode } from '../../services/code/codeClients.js';
import { resolveApiKey } from '../../config/apiKeyRouter.js';

export type BuildModelRole = 'flash' | 'pro' | 'grok' | 'sonnet' | 'opus';

const ROLE_LABEL: Record<BuildModelRole, string> = {
  flash: 'DeepSeek Flash',
  pro: 'DeepSeek Pro',
  grok: 'Grok Reasoning',
  sonnet: 'Claude Sonnet',
  opus: 'Claude Opus',
};

async function deepseekPro(system: string, user: string, maxTokens: number): Promise<string> {
  const sys = `${XROGA_USER_IDENTITY}\n\n${system}`;
  if (resolveApiKey('deepseek', 'code')) {
    return deepseekCode(sys, user, { maxTokens, model: 'deepseek-chat' });
  }
  if (getSecret('DEEPSEEK_API_KEY')) {
    return deepSeekChat(
      [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
      { model: 'deepseek-chat', maxTokens }
    );
  }
  return deepseekGenerate(user);
}

async function deepseekFlash(system: string, user: string, maxTokens: number): Promise<string> {
  try {
    const sys = `${XROGA_USER_IDENTITY}\n\n${system}`;
    if (resolveApiKey('groq', 'code')) {
      return groqCode(sys, user, { maxTokens: Math.min(maxTokens, 8192) });
    }
    if (getSecret('GROQ_API_KEY')) {
      return groqChat(
        [
          { role: 'system', content: sys },
          { role: 'user', content: user },
        ],
        { maxTokens: Math.min(maxTokens, 8192) }
      );
    }
  } catch {
    /* fall through */
  }
  return deepseekPro(system, user, maxTokens);
}

async function grokReasoning(system: string, user: string, maxTokens: number): Promise<string> {
  const apiKey = getSecret('GROK_API_KEY') ?? getSecret('XAI_API_KEY');
  if (!apiKey) return deepseekPro(system, user, maxTokens);

  const sys = `${XROGA_USER_IDENTITY}\n\n${system}`;
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'grok-3-mini-fast',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
      max_tokens: Math.min(maxTokens, 8192),
      temperature: 0.4,
      reasoning_effort: 'high',
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) throw new Error(`Grok ${response.status}`);
  const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
  const text = data.choices[0]?.message?.content?.trim();
  if (!text) throw new Error('Grok empty');
  return text;
}

async function claudeSonnet(system: string, user: string, maxTokens: number): Promise<string> {
  return claudeGenerateWithModel('claude-3-5-sonnet-20241022', `${XROGA_USER_IDENTITY}\n\n${system}`, user, {
    maxTokens,
  });
}

async function claudeOpus(system: string, user: string, maxTokens: number): Promise<string> {
  return claudeGenerateWithModel('claude-3-opus-20240229', `${XROGA_USER_IDENTITY}\n\n${system}`, user, {
    maxTokens: Math.min(maxTokens, 4096),
  });
}

/** Run a build pass; failures route to DeepSeek Pro. */
export async function buildModelCall(
  role: BuildModelRole,
  system: string,
  user: string,
  maxTokens = 16384
): Promise<{ text: string; modelLabel: string }> {
  const label = ROLE_LABEL[role];
  try {
    let text: string;
    switch (role) {
      case 'flash':
        text = await deepseekFlash(system, user, maxTokens);
        break;
      case 'pro':
        text = await deepseekPro(system, user, maxTokens);
        break;
      case 'grok':
        text = await grokReasoning(system, user, maxTokens);
        break;
      case 'sonnet':
        text = await claudeSonnet(system, user, maxTokens);
        break;
      case 'opus':
        text = await claudeOpus(system, user, maxTokens);
        break;
    }
    return { text, modelLabel: label };
  } catch (err) {
    console.warn(`[BuildModel] ${label} unavailable — DeepSeek Pro fallback:`, (err as Error).message?.slice(0, 120));
    const text = await deepseekPro(system, user, maxTokens);
    return { text, modelLabel: 'DeepSeek Pro' };
  }
}

export function modelActivityLine(modelLabel: string, action: string): string {
  return `[${modelLabel}] ${action}`;
}
