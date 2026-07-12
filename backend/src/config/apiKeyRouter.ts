/**
 * Dual-pipeline API key router — separate chat vs code generation keys.
 * Code keys fall back to chat keys when CODE variants are not set.
 */

import { getSecret } from './envSecrets.js';

export type PipelineMode = 'chat' | 'code';

export type CodeProvider = 'deepseek' | 'groq' | 'gemini';

const CODE_KEY_MAP: Record<CodeProvider, { code: string; chat: string }> = {
  deepseek: { code: 'DEEPSEEK_CODE_API_KEY', chat: 'DEEPSEEK_API_KEY' },
  groq: { code: 'GROQ_CODE_API_KEY', chat: 'GROQ_API_KEY' },
  gemini: { code: 'GEMINI_CODE_API_KEY', chat: 'GEMINI_API_KEY' },
};

/** Resolve API key for chat or code pipeline. Code mode prefers *_CODE_* keys. */
export function resolveApiKey(provider: CodeProvider, mode: PipelineMode): string | undefined {
  const keys = CODE_KEY_MAP[provider];
  if (mode === 'code') {
    return getSecret(keys.code) ?? getSecret(keys.chat);
  }
  return getSecret(keys.chat);
}

export function hasCodeKey(provider: CodeProvider): boolean {
  const keys = CODE_KEY_MAP[provider];
  return Boolean(getSecret(keys.code) ?? getSecret(keys.chat));
}

export function hasChatKey(provider: CodeProvider): boolean {
  return Boolean(getSecret(CODE_KEY_MAP[provider].chat));
}

import { XROGA_MODELS } from '../config/modelRegistry.js';

/** Preferred models per pipeline — DeepSeek V4 (Flash workhorse, Pro for reasoning) */
export const CODE_MODELS = {
  deepseek: XROGA_MODELS.deepseek_flash.apiModel,
  groq: 'llama-3.3-70b-versatile',
  gemini: 'gemini-2.0-flash',
} as const;

export const CHAT_MODELS = {
  deepseek: XROGA_MODELS.deepseek_flash.apiModel,
  groq: 'llama-3.1-8b-instant',
  gemini: 'gemini-2.0-flash',
} as const;

export function getCodeKeyStatus(): Record<string, boolean> {
  return {
    DEEPSEEK_CODE_API_KEY: Boolean(getSecret('DEEPSEEK_CODE_API_KEY')),
    GROQ_CODE_API_KEY: Boolean(getSecret('GROQ_CODE_API_KEY')),
    GEMINI_CODE_API_KEY: Boolean(getSecret('GEMINI_CODE_API_KEY')),
    DEEPSEEK_API_KEY: Boolean(getSecret('DEEPSEEK_API_KEY')),
    GROQ_API_KEY: Boolean(getSecret('GROQ_API_KEY')),
    GEMINI_API_KEY: Boolean(getSecret('GEMINI_API_KEY')),
  };
}
