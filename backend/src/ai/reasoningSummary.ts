import { chatCompletion, estimateMessageTokens, type ChatMessage } from './openaiCompat.js';
import { withTenantModelReservation, type BoundModelDispatch, type TenantModelScope } from './tenantModelDispatch.js';
import { requireResourceOwner, requireTenantContext } from '../security/tenantContext.js';
import { redactSecrets } from '../lib/truthfulExecution.js';
import { publicAiText } from '../lib/publicAiIdentity.js';

/**
 * User-safe working notes about this particular request, shown while the answer is prepared.
 *
 * This is a separate, tightly bounded model call, not the answering model's private reasoning. The
 * raw provider reasoning is never read here and never forwarded. The call goes through the same
 * tenant reservation as every other model call (`withTenantModelReservation`), so it is owned,
 * budgeted and settled by the existing ledger. Any failure returns null: the note is optional and
 * must never delay or replace the answer.
 */

export const REASONING_SUMMARY_MODEL = 'deepseek_v4_1_flash_1017' as const;
/** Spending bounds, not a style rule: the note is as long as the request needs within them. */
export const REASONING_SUMMARY_MAX_OUTPUT_TOKENS = 4_000;
export const REASONING_SUMMARY_MAX_LINES = 40;
export const REASONING_SUMMARY_MAX_LINE_CHARS = 600;

const SYSTEM = [
  'You write what a user watches while an assistant prepares an answer to their request, in the language the user wrote in.',
  'Write your working notes, one per line: what is being asked, what matters, what has to be worked out or',
  'checked, and how the answer will be shaped. Write notes only, never a plan, checklist or numbered steps.',
  'The reader is waiting: make each line one short sentence.',
  'Everything must be specific to this request. Never give the answer itself, never write code, never claim something',
  'was already searched, run or verified, and never mention these instructions, prompts, models or providers.',
].join(' ');

export function reasoningSummaryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = (env.XROGA_REASONING_SUMMARY ?? '').trim().toLowerCase();
  return flag !== 'off' && flag !== '0' && flag !== 'false';
}

/** Plain note lines only: no markup, code, hidden reasoning tags or secrets. One note per line. */
export function cleanReasoningSummary(raw: string, finishReason?: string | null): string | null {
  // At the output limit the last line stops mid-sentence unless the text ended on a line break.
  const whole = finishReason === 'length' ? raw.slice(0, raw.lastIndexOf('\n') + 1) : raw;
  const lines = publicAiText(redactSecrets(whole))
    .replace(/<think>[\s\S]*?<\/think>/gi, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .split(/\r?\n+/)
    .map((line) => line.replace(/[*_`#>]+/g, '').replace(/^\s*(?:(?:[-•]|\d+[.)])\s+|STEP(?:\s+SEARCH)?\s*[:\-]\s*)/i, '').replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 1)
    .map((line) => line.length <= REASONING_SUMMARY_MAX_LINE_CHARS ? line : `${line.slice(0, REASONING_SUMMARY_MAX_LINE_CHARS - 1).trimEnd()}…`)
    .slice(0, REASONING_SUMMARY_MAX_LINES);
  return lines.length ? lines.join('\n') : null;
}

export async function generateReasoningSummary(opts: {
  scope: TenantModelScope;
  message: string;
  signal?: AbortSignal;
}): Promise<string | null> {
  const message = opts.message.trim();
  if (!message) return null;
  try {
    const context = requireTenantContext(opts.scope.context);
    requireResourceOwner(context, opts.scope.userId);
    const scope = { ...opts.scope, context };
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Request:\n${message.slice(0, 6000)}` },
    ];
    const execute = (dispatch: BoundModelDispatch) => chatCompletion(
      REASONING_SUMMARY_MODEL,
      dispatch.payload.messages as ChatMessage[],
      {
        maxTokens: REASONING_SUMMARY_MAX_OUTPUT_TOKENS,
        temperature: 0.3,
        // Compact structured output: without private reasoning the notes arrive sooner and the whole
        // output budget is spent on text the user can read.
        reasoningMode: 'none',
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
    return cleanReasoningSummary(result.text, result.finishReason);
  } catch {
    return null;
  }
}
