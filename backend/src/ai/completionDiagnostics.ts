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
