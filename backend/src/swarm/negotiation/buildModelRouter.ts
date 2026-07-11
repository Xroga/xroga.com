/**
 * XROGA build model router — spec-aligned passes with DeepSeek fallback.
 * Architecture & logic: DeepSeek Pro | Scaffold: DeepSeek Flash | UI: Claude Sonnet | QA: Claude Opus
 */

import { deepSeekChat } from '../../lib/deepseek.js';
import { groqChat } from '../../lib/groq.js';
import { claudeGenerateWithModel } from '../../lib/anthropic.js';
import { deepseekGenerate } from '../../council/deepseekClient.js';
import { XROGA_USER_IDENTITY } from '../../prompts/xrogaIdentity.js';
import { getSecret } from '../../config/envSecrets.js';
import { deepseekCode, groqCode } from '../../services/code/codeClients.js';
import { resolveApiKey } from '../../config/apiKeyRouter.js';

export type BuildModelRole = 'flash' | 'pro' | 'sonnet' | 'opus';

const ROLE_LABEL: Record<BuildModelRole, string> = {
  flash: 'DeepSeek Flash',
  pro: 'DeepSeek Pro',
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
    /* fall through to DeepSeek Pro */
  }
  return deepseekPro(system, user, maxTokens);
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

/** Run a build pass on the designated model; any failure routes to DeepSeek Pro. */
export async function buildModelCall(
  role: BuildModelRole,
  system: string,
  user: string,
  maxTokens = 8192
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
