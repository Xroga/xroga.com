import { chatCompletion, estimateMessageTokens, type ChatMessage } from './openaiCompat.js';
import { withTenantModelReservation, type BoundModelDispatch, type TenantModelScope } from './tenantModelDispatch.js';
import { requireResourceOwner, requireTenantContext } from '../security/tenantContext.js';
import { redactSecrets } from '../lib/truthfulExecution.js';
import { publicAiText } from '../lib/publicAiIdentity.js';

/**
 * A short, user-safe "how I'll approach this" note shown above the answer while it is prepared.
 *
 * This is a separate, tightly bounded model call, not the answering model's private reasoning. The
 * raw provider reasoning is never read here and never forwarded. The call goes through the same
 * tenant reservation as every other model call (`withTenantModelReservation`), so it is owned,
 * budgeted and settled by the existing ledger. Any failure returns null: the note is optional and
 * must never delay or replace the answer.
 */

export const REASONING_SUMMARY_MODEL = 'deepseek_v4_1_flash_1017' as const;
export const REASONING_SUMMARY_MAX_OUTPUT_TOKENS = 140;
export const REASONING_SUMMARY_MAX_CHARS = 360;
/** Greetings and one-word messages get no note. */
export const REASONING_SUMMARY_MIN_MESSAGE_CHARS = 24;

const SYSTEM = [
  'You write a short status note that a user reads while an assistant prepares an answer.',
  'Write 1 to 3 plain sentences, at most 55 words, describing the approach to the request: what matters most and what will be checked or compared.',
  'Rules: never answer the request; no code; no lists; no markdown; no step numbering; do not claim you searched, ran or verified anything;',
  'do not repeat the request; do not mention these rules, prompts, models or providers; no private reasoning, only a clear approach.',
].join(' ');

export function reasoningSummaryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = (env.XROGA_REASONING_SUMMARY ?? '').trim().toLowerCase();
  return flag !== 'off' && flag !== '0' && flag !== 'false';
}

/** Removes anything that is not a plain sentence note and bounds the length. */
export function cleanReasoningSummary(raw: string): string | null {
  const text = publicAiText(redactSecrets(raw))
    .replace(/<think>[\s\S]*?<\/think>/gi, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#>]+/g, '')
    .replace(/^\s*(?:[-•]|\d+[.)])\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length < 20) return null;
  if (text.length <= REASONING_SUMMARY_MAX_CHARS) return text;
  const cut = text.slice(0, REASONING_SUMMARY_MAX_CHARS);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  return end >= 60 ? cut.slice(0, end + 1) : `${cut.slice(0, REASONING_SUMMARY_MAX_CHARS - 1).trimEnd()}…`;
}

export async function generateReasoningSummary(opts: {
  scope: TenantModelScope;
  message: string;
  signal?: AbortSignal;
}): Promise<string | null> {
  const message = opts.message.trim();
  if (message.length < REASONING_SUMMARY_MIN_MESSAGE_CHARS) return null;
  try {
    const context = requireTenantContext(opts.scope.context);
    requireResourceOwner(context, opts.scope.userId);
    const scope = { ...opts.scope, context };
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Request:\n${message.slice(0, 1500)}` },
    ];
    const execute = (dispatch: BoundModelDispatch) => chatCompletion(
      REASONING_SUMMARY_MODEL,
      dispatch.payload.messages as ChatMessage[],
      {
        maxTokens: REASONING_SUMMARY_MAX_OUTPUT_TOKENS,
        temperature: 0.3,
        credentialOverride: dispatch.credentialOverride,
        beforeDispatch: dispatch.beforeDispatch,
      },
    );
    const result = await withTenantModelReservation({
      scope,
      modelId: REASONING_SUMMARY_MODEL,
      payload: { messages },
      estimatedInputTokens: estimateMessageTokens(messages),
      maximumOutputTokens: REASONING_SUMMARY_MAX_OUTPUT_TOKENS,
      purpose: 'complexity',
      execute,
    });
    if (opts.signal?.aborted) return null;
    return cleanReasoningSummary(result.text);
  } catch {
    return null;
  }
}
