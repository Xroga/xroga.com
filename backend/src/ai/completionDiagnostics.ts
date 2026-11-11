import { PostCompletionAccountingError } from './postCompletionAccounting.js';
import { requiresAuthorizationReview } from './answerAuthorizationReview.js';

export { requiresAuthorizationReview };

/** Content-free receipt. Never include prompts, response text, tool arguments or reasoning. */
export class CompletionDiagnostics {
  chunks = 0;
  choices = 0;
  answerCharacters = 0;
  reasoningCharacters = 0;
  toolCalls = 0;
  refusal = false;
  finishReason: string | null = null;
  providerRequestId: string | null = null;
  usage: { inputTokens: number | null; outputTokens: number | null } | null = null;
  observe(raw: unknown, streaming: boolean) {
    const value = raw as { id?: unknown; choices?: Array<{ delta?: Record<string, unknown>; message?: Record<string, unknown>; finish_reason?: unknown }>; usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } };
    this.chunks++;
    if (typeof value.id === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(value.id)) this.providerRequestId ??= value.id;
    const choices = Array.isArray(value.choices) ? value.choices : [];
    this.choices += choices.length;
    const choice = choices[0];
    const message = streaming ? choice?.delta : choice?.message;
    if (typeof message?.content === 'string') this.answerCharacters += message.content.length;
    for (const key of ['reasoning_content', 'reasoning']) if (typeof message?.[key] === 'string') this.reasoningCharacters += (message[key] as string).length;
    this.toolCalls += Array.isArray(message?.tool_calls) ? message.tool_calls.length : 0;
    this.refusal ||= typeof message?.refusal === 'string' && message.refusal.length > 0;
    if (typeof choice?.finish_reason === 'string' && ['stop', 'length', 'tool_calls', 'content_filter', 'function_call'].includes(choice.finish_reason)) this.finishReason = choice.finish_reason;
    if (value.usage) {
      const count = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : null;
      this.usage = { inputTokens: count(value.usage.prompt_tokens), outputTokens: count(value.usage.completion_tokens) };
    }
  }
  receipt() { return { ...this }; }
}

export function requirePublicCompletion(text: string, modelId: string, diagnostics: CompletionDiagnostics): string {
  if (text.trim()) return text.trim();
  // Observation does not prove token exhaustion, a filter, or upstream cause.
  const receipt = diagnostics.receipt();
  console.warn('[model-empty-completion]', { modelId, ...receipt });
  throw Object.assign(new Error(`${modelId} returned an empty completion`), {
    code: 'EMPTY_PROVIDER_RESPONSE', retryable: false, completionDiagnostics: receipt,
  });
}

/** Public completion state, without provider identity or private reasoning. */
export type PublicCompletionState =
  | { status: 'complete' }
  | { status: 'partial'; reason: 'output_limit' | 'unconfirmed_stop' | 'authorization_review' | 'factual_review' | 'presentation_contract' | 'data_review' };

export function publicCompletionState(finishReason: string | null | undefined, answer = ''): PublicCompletionState {
  // This is a narrow negative check, not a certificate that other facts are true.
  // Preserve the received answer and its accounting, without retrying or rewriting it.
  if (requiresAuthorizationReview(answer)) return { status: 'partial', reason: 'authorization_review' };
  return finishReason === 'stop' ? { status: 'complete' }
    : { status: 'partial', reason: finishReason === 'length' ? 'output_limit' : 'unconfirmed_stop' };
}

/** OpenRouter usage.cost is the charge for the whole request, including reasoning.
 * Round up only to the existing ledger's integer micro-USD precision. Missing
 * metadata keeps conservative catalogue accounting. Malformed metadata fails closed. */
export function providerCostMicroUsd(usage: unknown): number | undefined {
  if (!usage || typeof usage !== 'object' || !('cost' in usage) || usage.cost == null) return undefined;
  const cost = usage.cost;
  if (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0 || cost * 1_000_000 > Number.MAX_SAFE_INTEGER) {
    throw new PostCompletionAccountingError();
  }
  return Math.ceil(cost * 1_000_000);
}
