import { MODELS, type ModelId } from './models.js';
import { DEFAULT_BUILDER_BUDGET } from './builderAttempt.js';
import { estimateTokens, type ChatMessage } from './openaiCompat.js';
import { estimateProviderReservationMicroUsd } from './providerBudget.js';
import { workspaceHistoryCapacity } from './workspaceConversation.js';
import {
  NATIVE_WORKSPACE_REASONING_RESERVE_TOKENS,
  presentedAnswerMaxTokens,
  type PresentationPlan,
  type PresentationResponseFormat,
} from './responsePresentation.js';

type WorkspaceAnswerBudget = {
  modelId: ModelId;
  prompt: string;
  messages: ChatMessage[];
  plan?: PresentationPlan;
  responseFormat?: PresentationResponseFormat;
  reasoning?: 'default' | 'none';
  brief?: boolean;
  complexity?: 'low' | 'medium' | 'high' | 'unknown';
  requestedDocument?: boolean;
  evidenceText?: string;
  maximumCostMicroUsd?: number;
};

/** A stated length is a sizing hint. It cannot authorize a destination, change
 * the request, or increase the provider or accounting maxima. */
function explicitlyRequestedOutput(prompt: string): number {
  let target = 0;
  for (const [, count, unit] of prompt.matchAll(/\b(\d+(?:[,]\d{3})*)[\s-]+(words?|tokens?|rows?|records?)\b/giu)) {
    const quantity = Number(count.replace(/,/g, ''));
    const multiplier = /^words?/iu.test(unit) ? 2 : /^(?:rows?|records?)/iu.test(unit) ? 32 : 1;
    target = Math.max(target, quantity * multiplier);
  }
  return target;
}

export function workspaceAnswerOutputTokens(request: WorkspaceAnswerBudget): number {
  const { modelId, prompt, messages, plan, responseFormat, reasoning, brief, complexity,
    requestedDocument, evidenceText, maximumCostMicroUsd } = request;
  const model = MODELS[modelId];
  const plannedAnswer = presentedAnswerMaxTokens(plan);
  const reasoningTokens = reasoning === 'default' ? NATIVE_WORKSPACE_REASONING_RESERVE_TOKENS : 0;
  const ordinary = brief ? Math.max(plannedAnswer, reasoningTokens) : plannedAnswer + reasoningTokens;
  if (model.maximumOutputTokens === undefined) return ordinary;

  // Preserve the efficient budget for small questions. Larger source material,
  // requested artifacts and complex work need more room beyond the planned UI.
  const promptTokens = estimateTokens(prompt);
  const evidenceTokens = evidenceText ? estimateTokens(evidenceText) : 0;
  const volume = Math.max(0, promptTokens + Math.ceil(evidenceTokens / 4) - 1024);
  const depth = brief ? 0 : complexity === 'high' ? plannedAnswer * 2 : complexity === 'medium' ? plannedAnswer : 0;
  const output = Math.max(plannedAnswer, explicitlyRequestedOutput(prompt), volume + depth);
  const extra = output - plannedAnswer;
  const wanted = ordinary + extra + (requestedDocument ? Math.ceil(promptTokens / 2) : 0)
    + (reasoningTokens ? Math.ceil(extra / 2) : 0);

  const responseFormatInput = responseFormat ? [{ role: 'system' as const, content: JSON.stringify(responseFormat) }] : [];
  const availableContext = Math.max(1, workspaceHistoryCapacity(modelId, 0, [...messages, ...responseFormatInput]));
  let limit = Math.min(model.maximumOutputTokens, availableContext, Math.ceil(wanted / 512) * 512);
  if (maximumCostMicroUsd === undefined) return limit;

  // The same conservative wire-input size and reservation calculation are used
  // by callBuilderStream when a call has a verified signed spend ceiling.
  const estimatedInputTokens = Buffer.byteLength(JSON.stringify({ messages, responseFormat }), 'utf8');
  const canReserve = (maximumOutputTokens: number) =>
    estimateProviderReservationMicroUsd({ modelId, estimatedInputTokens, maximumOutputTokens }) <= maximumCostMicroUsd;
  let minimum = 1;
  while (minimum < limit) {
    const middle = Math.ceil((minimum + limit) / 2);
    if (canReserve(middle)) minimum = middle;
    else limit = middle - 1;
  }
  // If even one token cannot be reserved, the existing authority boundary
  // rejects the request without dispatch. The ceiling is never increased here.
  return limit;
}

/** Keep a transport memory backstop with headroom for longer decoded tokens. */
export function workspaceAnswerOutputChars(modelId: ModelId, maximumOutputTokens: number): number {
  const providerMaximum = MODELS[modelId].maximumOutputTokens;
  const defaultGuard = DEFAULT_BUILDER_BUDGET.maxOutputChars;
  return providerMaximum === undefined
    ? defaultGuard : Math.max(defaultGuard, 8 * Math.min(maximumOutputTokens, providerMaximum));
}
