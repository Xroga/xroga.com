import OpenAI from 'openai';
import { getSecret } from '../config/envSecrets.js';
import {
  MODELS,
  OPENROUTER_BASE_URL,
  modelConfigurationIssues,
  resolveModelSpec,
  type ModelId,
} from './models.js';
import { recordModelExecution } from './providerRuntime.js';
import { ProviderPolicyError, requiredCodingTransport } from './providerPolicy.js';
import { withTemperatureFallback } from './temperatureCompat.js';
import { pinnedProviderRequest, retryOtherApprovedEndpoint, validatedOpenRouterEndpoints,
  type ValidatedEndpoint } from './openRouterRouting.js';

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export interface ChatResult {
  text: string;
  /**
   * Why the model stopped. `length` means the reply was cut at the token ceiling.
   *
   * Discarded until now, and its absence was actively misleading: a truncated reply and a
   * malformed one both parse to nothing, so a JSON payload cut mid-string was reported as
   * the model producing unusable output. Observed in production — two DeepSeek models were
   * recorded as returning "no parsable files" for a whole-project generation that had
   * almost certainly hit the ceiling. Those two failures need opposite responses: raise the
   * budget or split the work, versus fix the prompt.
   */
  finishReason?: string | null;
  modelId: ModelId;
  apiModel: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  providerRequestId?: string;
  upstreamProvider?: string;
  providerAttempts?: string[];
  cachedInputTokens?: number;
  reasoningTokens?: number;
  actualCostUsd?: number;
}

interface ResolvedEndpoint {
  apiKey: string;
  baseUrl: string;
  apiModel: string;
  provider: string;
  defaultHeaders?: Record<string, string>;
}

export type ReasoningMode = 'default' | 'none';

/**
 * Provider-supported controls for calls that need direct public output rather than a
 * long hidden reasoning phase. Keep this explicit and provider-scoped: forwarding an
 * invented compatibility parameter to Moonshot (or another provider) can turn a healthy
 * fallback into a 400 response.
 */
export function providerReasoningControls(
  provider: string,
  mode: ReasoningMode = 'default',
): Record<string, unknown> {
  if (mode === 'default') return {};
  if (provider === 'zhipu') {
    return { thinking: { type: 'disabled' } };
  }
  if (provider === 'openrouter') {
    return { reasoning: { effort: 'none', exclude: true } };
  }
  return {};
}

function modelReasoningControls(modelId: ModelId, provider: string, mode?: ReasoningMode): Record<string, unknown> {
  // Both approved GLM Flash endpoints require reasoning. Sending effort=none is a
  // provider 400; omitting the override keeps the approved, price-capped route usable.
  if (modelId === 'glm_5_3_flash' && mode === 'none') return {};
  return providerReasoningControls(provider, mode);
}

export function requireNonEmptyModelText(text: string, modelId: ModelId): string {
  const normalized = text.trim();
  if (normalized) return normalized;
  const error = new Error(`${modelId} returned an empty completion`) as Error & {
    code?: string;
  };
  error.code = 'EMPTY_PROVIDER_RESPONSE';
  throw error;
}

/**
 * The provider identifier to send.
 *
 * The env-var table that used to live here is gone: `models.ts` now owns `modelIdEnv` per
 * model, so the mapping cannot drift from the catalogue it describes. A model that is not
 * fully configured has no identifier to return, and saying so is the honest answer —
 * `resolveEndpoint` below turns it into a refusal rather than a call to an empty model name.
 */
export function configuredApiModel(modelId: ModelId): string | null {
  return resolveModelSpec(modelId)?.apiModel ?? null;
}

export class ModelNotConfiguredError extends Error {
  readonly code = 'MODEL_NOT_CONFIGURED' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ModelNotConfiguredError';
  }
}

function openRouterHeaders(): Record<string, string> {
  const referer = process.env.FRONTEND_URL || 'https://xroga.com';
  return {
    'HTTP-Referer': referer,
    'X-Title': 'Xroga AI Swarm',
  };
}

/**
 * Resolve API endpoint for a model.
 * Every active model uses OpenRouter and the single OPENROUTER_API_KEY.
 */
export function resolveEndpoint(modelId: ModelId, credentialOverride?: string): ResolvedEndpoint {
  const def = MODELS[modelId];

  // §7's transport binding, enforced rather than described.
  //
  // `providerPolicy` has always named the transport each coding model must use, and until
  // now nothing consulted it: `requiredCodingTransport` had no caller outside its own test,
  // so the binding held only because `MODELS` happened to agree with it. Editing one
  // `provider` field in the registry was enough to send a coding model's prompts — a user's
  // proprietary source — to a different vendor under a different key, silently and with no
  // test failing.
  //
  // Checked here because this is the single point where a model id becomes a destination
  // and a credential. A check at any routing site above would leave this one reachable.
  const requiredTransport = requiredCodingTransport(modelId);
  if (requiredTransport && def.provider !== requiredTransport) {
    throw new ProviderPolicyError(
      `${modelId} must reach its provider over ${requiredTransport}, but the model registry ` +
        `resolves it to ${def.provider}. Refusing the call: routing a coding model through an ` +
        'unapproved transport would send prompts and source code to a vendor the policy does ' +
        'not permit for that model.',
    );
  }

  // Configuration is checked *after* the transport policy, deliberately.
  //
  // A model can be both misconfigured and mis-transported. If the configuration guard ran
  // first, that model would report "not configured" and the transport violation would never
  // be reached — a security invariant silently skipped because of an unrelated operational
  // gap. The policy check needs only the registry's `provider` field, so it can and should
  // run unconditionally.
  const spec = resolveModelSpec(modelId);
  if (!spec) {
    const issues = modelConfigurationIssues(modelId).join(', ');
    throw new ModelNotConfiguredError(
      `${modelId} is registered but not configured (${issues}). ` +
        'Supply the operator configuration for it, or route to a configured model.',
    );
  }
  const apiModel = spec.apiModel;

  if (def.provider === 'openrouter') {
    const orKey = credentialOverride?.trim() || getSecret('OPENROUTER_API_KEY');
    if (!orKey) {
      throw new Error(
        `OPENROUTER_API_KEY is not configured (required for ${apiModel}). ` +
          'All active models run only via OpenRouter.',
      );
    }
    return {
      apiKey: orKey,
      baseUrl: OPENROUTER_BASE_URL,
      apiModel,
      provider: 'openrouter',
      defaultHeaders: openRouterHeaders(),
    };
  }

  throw new ProviderPolicyError(`${modelId} has an unapproved direct-provider transport`);
}

function clientFor(endpoint: ResolvedEndpoint, fetcher?: typeof fetch): OpenAI {
  return new OpenAI({
    apiKey: endpoint.apiKey,
    baseURL: endpoint.baseUrl,
    timeout: 180_000,
    // Xroga owns the sequential two-endpoint retry; SDK retries obscure the upstream route.
    maxRetries: 0,
    defaultHeaders: endpoint.defaultHeaders,
    // The SDK's Fetch typing still describes node-fetch responses; the runtime accepts
    // the standard Fetch API used by the endpoint-catalog test seam.
    ...(fetcher ? { fetch: fetcher as unknown as NonNullable<ConstructorParameters<typeof OpenAI>[0]>['fetch'] } : {}),
  });
}

function contentTokenEstimate(content: string | ContentPart[]): number {
  if (typeof content === 'string') return estimateTokens(content);
  let n = 0;
  for (const part of content) {
    if (part.type === 'text') n += estimateTokens(part.text);
    // Rough vision token budget per image
    if (part.type === 'image_url') n += 1200;
  }
  return Math.max(1, n);
}

export async function chatCompletion(
  modelId: ModelId,
  messages: ChatMessage[],
  opts: {
    maxTokens?: number;
    temperature?: number;
    json?: boolean;
    /** Provider-specific reasoning control for compact structured workloads. */
    reasoningMode?: ReasoningMode;
    signal?: AbortSignal;
    credentialOverride?: string;
    /** Test seam only; never sourced from model output or a user request. */
    fetcher?: typeof fetch;
  } = {},
): Promise<ChatResult> {
  const started = Date.now();
  try {
    const endpoint = resolveEndpoint(modelId, opts.credentialOverride);
    const client = clientFor(endpoint, opts.fetcher);
    const hasImages = messages.some(message => Array.isArray(message.content)
      && message.content.some(part => part.type === 'image_url'));
    const approved = await validatedOpenRouterEndpoints(modelId, {
      json: opts.json, images: hasImages,
      fetcher: opts.fetcher,
      requiredContext: estimateMessageTokens(messages) + (opts.maxTokens ?? 8192),
    });
    const attempts: string[] = [];
    let selected: ValidatedEndpoint | undefined;
    let completion: OpenAI.Chat.ChatCompletion | undefined;
    let lastError: unknown;
    for (const candidate of approved) {
      if (opts.signal?.aborted) throw opts.signal.reason ?? new Error('Request cancelled');
      attempts.push(candidate.tag);
      try {
        const response = await withTemperatureFallback(opts.temperature ?? 0.4, (temperature) =>
          client.chat.completions.create({
            model: endpoint.apiModel,
            messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
            max_tokens: opts.maxTokens ?? 8192,
            ...(temperature === undefined ? {} : { temperature }),
            ...modelReasoningControls(modelId, endpoint.provider, opts.reasoningMode),
            ...(opts.json ? { response_format: { type: 'json_object' as const } } : {}),
            provider: pinnedProviderRequest(candidate, modelId),
            usage: { include: true },
          } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
          opts.signal ? { signal: opts.signal } : undefined),
        );
        const actualProvider = (response as OpenAI.Chat.ChatCompletion & { provider?: string }).provider;
        if (actualProvider !== candidate.provider) {
          throw new ProviderPolicyError('OpenRouter returned an unapproved upstream provider');
        }
        const answer = (response.choices[0]?.message?.content ?? '').trim();
        const reasoning = (response.choices[0]?.message as { reasoning_content?: unknown } | undefined)?.reasoning_content;
        if (!answer) {
          const error = new Error(typeof reasoning === 'string' && reasoning
            ? `${modelId} used its output budget reasoning without an answer`
            : `${modelId} returned an empty completion`) as Error & { code?: string };
          // A 200 response may already have consumed paid tokens. Keep the budget hold
          // for reconciliation; do not buy a second answer on this same reservation.
          error.code = 'BILLED_EMPTY_PROVIDER_RESPONSE';
          throw error;
        }
        selected = candidate;
        completion = response;
        break;
      } catch (error) {
        lastError = error;
        if (!retryOtherApprovedEndpoint(error) || opts.signal?.aborted) throw error;
      }
    }
    if (!completion || !selected) throw lastError ?? new Error('Both approved providers are unavailable');
    const choice = completion.choices[0]?.message;

    // Reasoning models split their reply in two. GLM and the DeepSeek v4 family return
    // their thinking in `reasoning_content` and the answer in `content`. Reading only
    // `content` means a model that spent its whole output budget thinking looks, from
    // here, exactly like a provider that returned nothing — which is what "empty
    // completion" reported for every GLM implementation attempt in production while the
    // API itself was answering normally.
    //
    // The reasoning text is deliberately NOT used as the answer. It is a model's working,
    // not its output, and committing it as a source file would be worse than failing. It is
    // read only to tell the two situations apart, because they need different fixes: a
    // larger output budget versus a different provider.
    const reasoning =
      typeof (choice as { reasoning_content?: unknown })?.reasoning_content === 'string'
        ? ((choice as { reasoning_content?: string }).reasoning_content ?? '').trim()
        : '';
    const answer = (choice?.content ?? '').trim();

    if (!answer && reasoning) {
      const error = new Error(
        `${modelId} returned ${reasoning.length} characters of reasoning but no answer — its ` +
          'output budget was spent thinking. Raise the budget for this call or route to a ' +
          'model that answers within it.',
      ) as Error & { code?: string };
      error.code = 'REASONING_WITHOUT_ANSWER';
      throw error;
    }

    const text = requireNonEmptyModelText(answer, modelId);
    const inputTokens =
      completion.usage?.prompt_tokens ??
      messages.reduce((sum, m) => sum + contentTokenEstimate(m.content), 0);
    const outputTokens = completion.usage?.completion_tokens ?? estimateTokens(text);
    const extendedUsage = completion.usage as (OpenAI.CompletionUsage & {
      cost?: number;
      prompt_tokens_details?: { cached_tokens?: number };
      completion_tokens_details?: { reasoning_tokens?: number };
    }) | undefined;
    const actualCostUsd = extendedUsage?.cost;
    if (actualCostUsd !== undefined && (!Number.isFinite(actualCostUsd) || actualCostUsd < 0)) {
      throw new ProviderPolicyError('OpenRouter returned invalid cost accounting');
    }
    recordModelExecution(modelId, { ok: true, latencyMs: Date.now() - started });
    return {
      text,
      finishReason: completion.choices[0]?.finish_reason ?? null,
      modelId,
      apiModel: endpoint.apiModel,
      provider: endpoint.provider,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      providerRequestId: completion.id,
      upstreamProvider: selected.provider,
      providerAttempts: attempts,
      cachedInputTokens: extendedUsage?.prompt_tokens_details?.cached_tokens ?? 0,
      reasoningTokens: extendedUsage?.completion_tokens_details?.reasoning_tokens ?? 0,
      actualCostUsd,
    };
  } catch (error) {
    recordModelExecution(modelId, { ok: false, latencyMs: Date.now() - started, error });
    throw error;
  }
}

export async function chatCompletionStream(
  modelId: ModelId,
  messages: ChatMessage[],
  opts: {
    maxTokens?: number;
    temperature?: number;
    onDelta?: (delta: string) => void;
    /** Provider stream activity, including private reasoning chunks. */
    onActivity?: () => void;
    /** Provider-specific reasoning control. Used only by direct-output workloads. */
    reasoningMode?: ReasoningMode;
    /** Ask the compatible endpoint to constrain the response to one JSON object. */
    json?: boolean;
    signal?: AbortSignal;
    credentialOverride?: string;
    /** Test seam only; never sourced from model output or a user request. */
    fetcher?: typeof fetch;
  } = {},
): Promise<ChatResult> {
  const started = Date.now();
  try {
    const endpoint = resolveEndpoint(modelId, opts.credentialOverride);
    const client = clientFor(endpoint, opts.fetcher);
    if (opts.signal?.aborted) {
      const err = new Error('Build cancelled') as Error & { code?: string };
      err.code = 'BUILD_CANCELLED';
      throw err;
    }
    const hasImages = messages.some(message => Array.isArray(message.content)
      && message.content.some(part => part.type === 'image_url'));
    const approved = await validatedOpenRouterEndpoints(modelId, {
      json: opts.json, images: hasImages,
      fetcher: opts.fetcher,
      requiredContext: estimateMessageTokens(messages) + (opts.maxTokens ?? 8192),
    });
    const attempts: string[] = [];
    let lastError: unknown;
    for (const candidate of approved) {
      if (opts.signal?.aborted) throw opts.signal.reason ?? new Error('Request cancelled');
      attempts.push(candidate.tag);
      let text = '';
      let providerRequestId: string | undefined;
      let finishReason: string | null = null;
      let inputTokens = estimateMessageTokens(messages);
      let outputTokens = 0;
      let cachedInputTokens = 0;
      let reasoningTokens = 0;
      let actualCostUsd: number | undefined;
      try {
        const stream = await withTemperatureFallback(opts.temperature ?? 0.4, (temperature) =>
          client.chat.completions.create({
            model: endpoint.apiModel,
            messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
            max_tokens: opts.maxTokens ?? 8192,
            ...(temperature === undefined ? {} : { temperature }),
            ...modelReasoningControls(modelId, endpoint.provider, opts.reasoningMode),
            ...(opts.json ? { response_format: { type: 'json_object' as const } } : {}),
            stream: true,
            stream_options: { include_usage: true },
            provider: pinnedProviderRequest(candidate, modelId),
            usage: { include: true },
          } as OpenAI.Chat.ChatCompletionCreateParamsStreaming,
          opts.signal ? { signal: opts.signal } : undefined),
        );
        for await (const chunk of stream) {
          providerRequestId ??= chunk.id;
          if (opts.signal?.aborted) throw opts.signal.reason ?? new Error('Build cancelled');
          const actualProvider = (chunk as typeof chunk & { provider?: string }).provider;
          if (actualProvider && actualProvider !== candidate.provider) {
            throw new ProviderPolicyError('OpenRouter returned an unapproved upstream provider');
          }
          const choice = chunk.choices[0];
          const delta = choice?.delta?.content ?? '';
          const reasoningDelta = (choice?.delta as { reasoning_content?: unknown } | undefined)?.reasoning_content;
          if (delta || (typeof reasoningDelta === 'string' && reasoningDelta.length > 0)
            || choice?.finish_reason || chunk.usage) opts.onActivity?.();
          finishReason = choice?.finish_reason ?? finishReason;
          if (delta) { text += delta; opts.onDelta?.(delta); }
          if (chunk.usage) {
            const usage = chunk.usage as typeof chunk.usage & {
              cost?: number;
              prompt_tokens_details?: { cached_tokens?: number };
              completion_tokens_details?: { reasoning_tokens?: number };
            };
            inputTokens = usage.prompt_tokens ?? inputTokens;
            outputTokens = usage.completion_tokens ?? outputTokens;
            cachedInputTokens = usage.prompt_tokens_details?.cached_tokens ?? cachedInputTokens;
            reasoningTokens = usage.completion_tokens_details?.reasoning_tokens ?? reasoningTokens;
            actualCostUsd = usage.cost ?? actualCostUsd;
          }
        }
        if (!text.trim()) {
          const error = new Error(`${modelId} returned no public answer after a provider stream`) as Error & { code?: string };
          error.code = 'BILLED_EMPTY_PROVIDER_RESPONSE';
          throw error;
        }
        text = requireNonEmptyModelText(text, modelId);
        if (!outputTokens) outputTokens = estimateTokens(text);
        if (actualCostUsd !== undefined && (!Number.isFinite(actualCostUsd) || actualCostUsd < 0)) {
          throw new ProviderPolicyError('OpenRouter returned invalid cost accounting');
        }
        recordModelExecution(modelId, { ok: true, latencyMs: Date.now() - started });
        return { text, finishReason, modelId, apiModel: endpoint.apiModel,
          provider: endpoint.provider, upstreamProvider: candidate.provider,
          providerAttempts: attempts, inputTokens, outputTokens,
          totalTokens: inputTokens + outputTokens, providerRequestId,
          cachedInputTokens, reasoningTokens, actualCostUsd };
      } catch (error) {
        lastError = error;
        // Once a delta is visible to the caller, another provider would duplicate output.
        if (text || !retryOtherApprovedEndpoint(error) || opts.signal?.aborted) throw error;
      }
    }
    throw lastError ?? new Error('Both approved providers are unavailable');
  } catch (error) {
    recordModelExecution(modelId, { ok: false, latencyMs: Date.now() - started, error });
    throw error;
  }
}

/** Build OpenAI-compatible multimodal user content (text + images). */
export function buildVisionUserContent(
  text: string,
  imageUrls: string[],
  detail: 'auto' | 'low' | 'high' = 'high',
): ContentPart[] {
  const parts: ContentPart[] = [{ type: 'text', text }];
  for (const url of imageUrls.slice(0, 4)) {
    parts.push({ type: 'image_url', image_url: { url, detail } });
  }
  return parts;
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateMessageTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, message) => sum + contentTokenEstimate(message.content), 0);
}

export function modelKeyStatus(): Record<string, boolean> {
  return {
    OPENROUTER_API_KEY: Boolean(getSecret('OPENROUTER_API_KEY')),
  };
}

/** Which transport each model will use with current env */
export function modelTransportStatus(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of Object.keys(MODELS) as ModelId[]) {
    try {
      const ep = resolveEndpoint(id);
      out[id] = `${ep.provider}:${ep.apiModel}`;
    } catch {
      out[id] = 'unconfigured';
    }
  }
  return out;
}
