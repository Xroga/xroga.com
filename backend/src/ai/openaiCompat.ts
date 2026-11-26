import OpenAI, {type ClientOptions} from 'openai';
import { isDeepStrictEqual } from 'node:util';
import { getSecret } from '../config/envSecrets.js';
import {
  MODELS,
  ACTIVE_MODEL_IDS,
  assertActiveModelId,
  modelConfigurationIssues,
  resolveModelSpec,
  type ModelId,
} from './models.js';
import { recordModelExecution } from './providerRuntime.js';
import { ProviderPolicyError, requiredCodingTransport, assertModelProviderDestination, assertModelEnabled } from './providerPolicy.js';
import {containsCredentialSecretText} from '../security/egress/dataClassification.js';
import {publicHttpsUrl} from '../security/egress/urlPolicy.js';
import {requireModelSdkAdmission,modelAdmissionDenied,MODEL_REDIRECT_AFTER_DISPATCH,admittedModelReservation} from './modelSdkAdmission.js';
import {acquireModelRequestLease,providerCooldownSeconds,releasePacingWithBody} from './providerPacing.js';
import {DEFAULT_BUILDER_BUDGET} from './builderAttempt.js';
import { CompletionDiagnostics, requirePublicCompletion } from './completionDiagnostics.js';
import type { PresentationResponseFormat } from './responsePresentation.js';
import { validateZurelayRequest, verifyZurelayResponse, zurelayStreamUsageVerified } from './zurelayWire.js';

// No compatibility retry can replay a possibly charged request.
const withProviderTemperature = <T>(temperature: number | undefined, execute: (value: number | undefined) => Promise<T>) => execute(temperature);

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export interface ChatResult {
  providerCostMicroUsd?: number;
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
  cachedInputTokens?: number;
  reasoningTokens?: number;
  totalTokens: number;
  providerRequestId?: string;
}

interface ResolvedEndpoint {
  apiKey: string;
  baseUrl: string;
  apiModel: string;
  provider: string;
  defaultHeaders?: Record<string, string>;
}
const transportReceipts = new WeakMap<object, {requestId:string;model:string}>();
export function modelTransportReceipt(endpoint: ResolvedEndpoint): {requestId:string;model:string} {
  const receipt=transportReceipts.get(endpoint);
  if (!receipt || receipt.model !== endpoint.apiModel) throw Object.assign(new Error('Provider receipt is unavailable.'), {code:'POST_COMPLETION_ACCOUNTING_UNCERTAIN',retryable:false});
  return {...receipt};
}

export type ReasoningMode = 'default' | 'none';

/** Documented Zurelay nonthinking mode for compact DeepSeek output. Sonnet
 * cannot disable thinking with `none`, so never send it for that model. */
export function providerReasoningControls(
  provider: string,
  mode: ReasoningMode = 'default',
  modelId?: ModelId,
): Record<string, unknown> {
  if(provider==='zurelay' && mode==='none' && modelId==='deepseek_v4_1_flash_1017')return {reasoning_effort:'none'};
  return {};
}

export function providerPriceControls(modelId: ModelId, provider: string): Record<string, unknown> {
  return {};
}

/** Verify controls on the serialized request before any provider bytes leave. */
export function assertProviderControls(wireBody: string, modelId: ModelId, provider: string, mode?: ReasoningMode): void {
  const wire = JSON.parse(wireBody) as Record<string, unknown>;
  const expected = { ...providerPriceControls(modelId, provider), ...providerReasoningControls(provider, mode,modelId) };
  for (const [key, value] of Object.entries(expected)) if (!isDeepStrictEqual(wire[key], value)) modelAdmissionDenied();
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

export function resolveEndpoint(modelId: ModelId, credentialOverride?: string): ResolvedEndpoint {
  assertActiveModelId(modelId);
  assertModelEnabled(modelId);
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

  assertModelProviderDestination(def.provider,def.baseUrl,def.secretKey);

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

  const apiKey = credentialOverride?.trim() || getSecret(def.secretKey);
  if (!apiKey) {
    throw new Error(`${def.secretKey} is not configured on the server`);
  }
  return {
    apiKey,
    baseUrl: def.baseUrl,
    apiModel,
    provider: def.provider,
  };
}

export function createModelProviderClient(endpoint: ResolvedEndpoint,beforeDispatch?:(wireBody:string)=>Promise<void>,reservationGuard=beforeDispatch,
  onTiming?: (phase: 'queue' | 'provider_headers', elapsedMs: number) => void): OpenAI {
  publicHttpsUrl(endpoint.baseUrl);
  assertModelProviderDestination(endpoint.provider,endpoint.baseUrl);
  // The SDK wraps thrown fetch errors as retryable connection failures. Return
  // its normal nonretryable error protocol for a local transport denial.
  const deniedResponse=(code:'MODEL_DESTINATION_DENIED'|'MODEL_DISPATCH_BINDING_DENIED',dispatched=false)=>Response.json(
    {error:{message:'Local model transport denied before provider continuation.',code,...(dispatched?{type:MODEL_REDIRECT_AFTER_DISPATCH}:{})}},
    {status:400,headers:{'x-should-retry':'false'}}) as unknown as Awaited<ReturnType<NonNullable<ClientOptions['fetch']>>>;
  return new OpenAI({
    apiKey: endpoint.apiKey,
    baseURL: endpoint.baseUrl,
    timeout: 180_000,
    maxRetries: 0,
    defaultHeaders: { ...endpoint.defaultHeaders, 'x-zurelay-fallback': 'off' },
    fetch:async (input,init)=>{
      const url=new URL(typeof input==='string'?input:'url' in input?input.url:input.href);
      if(url.href!==endpoint.baseUrl+'/chat/completions'||init?.method?.toUpperCase()!=='POST'||typeof init.body!=='string')return deniedResponse('MODEL_DESTINATION_DENIED');
      // Recheck at every wire attempt, including SDK retries and clients created
      // before an operator disabled the provider. Never send those bytes first.
      try { assertModelProviderDestination(endpoint.provider,endpoint.baseUrl); }
      catch { return deniedResponse('MODEL_DESTINATION_DENIED'); }
      let lease:Awaited<ReturnType<typeof acquireModelRequestLease>>|undefined;
      let cooldown=0;
      const release=async()=>{try{await lease?.release(cooldown);}catch{console.warn('[model-pacing] release unavailable; bounded lease remains conservative');}};
      const queuedAt = performance.now();
      if(process.env.NODE_ENV==='production'){
        try{
          const binding=admittedModelReservation(reservationGuard);
          lease=await acquireModelRequestLease({binding,credential:endpoint.apiKey,signal:init.signal as AbortSignal|undefined});
        }catch{
          return Response.json({error:{message:'Model request capacity is temporarily busy. No provider retry was made.',code:'MODEL_PROVIDER_BUSY'}},
            {status:429,headers:{'x-should-retry':'false','retry-after':'60'}}) as unknown as Awaited<ReturnType<NonNullable<ClientOptions['fetch']>>>;
        }
      }
      onTiming?.('queue', performance.now() - queuedAt);
      try {
        if (!beforeDispatch) modelAdmissionDenied();
        validateZurelayRequest(JSON.parse(init.body), endpoint.apiModel);
        await beforeDispatch(init.body);
      }
      catch {
        await release();
        // Let the SDK preserve the local policy code, rather than wrapping a
        // thrown fetch error as a retryable/uncertain provider connection error.
        return deniedResponse('MODEL_DISPATCH_BINDING_DENIED');
      }
      const headers = new Headers(init.headers as Record<string, string>);
      headers.set('x-zurelay-fallback', 'off');
      let response:Response;
      const providerStarted = performance.now();
      try{
        const signal=AbortSignal.any([...(init.signal?[init.signal as AbortSignal]:[]),AbortSignal.timeout(180_000)]);
        response=await globalThis.fetch(url,{method:'POST',body:init.body,headers,signal,redirect:'manual'});
      }catch(error){await release();throw error;}
      onTiming?.('provider_headers', performance.now() - providerStarted);
      if(response.status===429){cooldown=providerCooldownSeconds(response.headers.get('retry-after'));await release();}
      if(response.redirected||(response.status>=300&&response.status<400)){
        await response.body?.cancel().catch(()=>undefined);
        await release();
        return deniedResponse('MODEL_DESTINATION_DENIED',true);
      }
      if(lease)response=releasePacingWithBody(response,release);
      // SDK v4's Node typings require node-fetch-only convenience methods, but
      // its chat JSON/SSE parser consumes the standard Response surface. Keep
      // this Node22 interoperability cast at the transport boundary and test
      // both actual SDK parsers, rather than invent those methods or metadata.
      try {
        const verified = await verifyZurelayResponse(response, endpoint.apiModel, JSON.parse(init.body).stream === true);
        if (verified.ok) {
          const requestId=verified.headers.get('x-request-id')!;
          if (containsCredentialSecretText(requestId) || (endpoint.apiKey.length >= 8 && requestId.includes(endpoint.apiKey))) throw Error('Invalid trace');
          transportReceipts.set(endpoint,{requestId,model:endpoint.apiModel});
        }
        return verified as unknown as Awaited<ReturnType<NonNullable<ClientOptions['fetch']>>>;
      } catch {
        await response.body?.cancel().catch(() => undefined);
        await release();
        return deniedResponse('MODEL_DESTINATION_DENIED', true);
      }
    },
  });
}

/** Shared by ordinary completion and the canonical SoftwareAgent SDK boundary.
 * Tool arguments/descriptions are data too. This issues no authority or budget. */
export function snapshotModelEgressPayload<T>(value:T,credential:string):T{
  const invalid=()=>Object.assign(Error('Model payload structure limit exceeded.'),{status:400,code:'MODEL_PAYLOAD_INVALID'});
  let snapshot:T;try{snapshot=structuredClone(value);}catch{throw invalid();}
  const pending:Array<{value:unknown;exit:boolean}>=[{value:snapshot,exit:false}],active=new Set<object>();let nodes=0;
  while(pending.length){
    const step=pending.pop()!,item=step.value;
    if(step.exit){active.delete(item as object);continue;}
    if(++nodes>100_000)throw invalid();
    if(typeof item==='string'){
      if(containsCredentialSecretText(item)||(credential.length>=8&&item.includes(credential)))throw Object.assign(Error('Model payload denied by credential egress policy.'),{status:400,code:'MODEL_CREDENTIAL_EGRESS_DENIED'});
    }else if(item&&typeof item==='object'){
      if(active.has(item))throw invalid();active.add(item);pending.push({value:item,exit:true});
      for(const [key,child] of Object.entries(item)){
        if(pending.length>=99_999)throw invalid();
        pending.push({value:key,exit:false},{value:child,exit:false});
      }
    }
  }
  return snapshot;
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
    responseFormat?: PresentationResponseFormat;
    /** Provider-specific reasoning control for compact structured workloads. */
    reasoningMode?: ReasoningMode;
    signal?: AbortSignal;
    /** Single-response transport only: visible text is released through the admission gate after the receipt is verified. */
    publishAfterVerification?: (text: string) => void;
    credentialOverride?: string;
    beforeDispatch?: (wireBody:string)=>Promise<void>;
  } = {},
): Promise<ChatResult> {
  const started = Date.now();
  opts={...opts,...(opts.responseFormat ? {responseFormat:structuredClone(opts.responseFormat)} : {})};
  try {
    const admission=requireModelSdkAdmission(opts.beforeDispatch,modelId,opts.credentialOverride);
    const checkCancellation=()=>{if(opts.signal?.aborted)throw Object.assign(Error('Build cancelled'),{name:'AbortError',code:'BUILD_CANCELLED'});};
    checkCancellation();
    const endpoint = resolveEndpoint(modelId, opts.credentialOverride);
    const responseFormat = opts.responseFormat
      ? process.env.ZURELAY_JSON_SCHEMA_VERIFIED === '1' ? opts.responseFormat : { type: 'json_object' as const }
      : opts.json ? { type: 'json_object' as const } : undefined;
    messages=snapshotModelEgressPayload(messages,endpoint.apiKey);
    const client = createModelProviderClient(endpoint,async wire=>{
      checkCancellation();
      const current=resolveEndpoint(modelId,opts.credentialOverride);
      if(current.apiKey!==endpoint.apiKey||current.baseUrl!==endpoint.baseUrl||current.apiModel!==endpoint.apiModel||current.provider!==endpoint.provider)modelAdmissionDenied();
      assertProviderControls(wire,modelId,endpoint.provider,opts.reasoningMode);
      if(!isDeepStrictEqual(JSON.parse(wire).response_format,responseFormat))modelAdmissionDenied();
      await opts.beforeDispatch!(wire);checkCancellation();
    },opts.beforeDispatch);
    const completion = await withProviderTemperature(modelId === 'claude_sonnet_5_5' ? undefined : opts.temperature ?? 0.4, (temperature) =>
      client.chat.completions.create(
        {
          model: endpoint.apiModel,
          messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
          max_tokens: opts.maxTokens ?? 8192,
          ...(temperature === undefined ? {} : { temperature }),
          ...providerReasoningControls(endpoint.provider, opts.reasoningMode,modelId),
          ...providerPriceControls(modelId, endpoint.provider),
          ...(responseFormat ? { response_format: responseFormat } : {}),
        },
        opts.signal ? { signal: opts.signal } : undefined,
      ),
    );
    const diagnostics = new CompletionDiagnostics();
    diagnostics.observe(completion, false);
    const choice = completion.choices[0]?.message;

    // Private reasoning is counted in the receipt, never published as an answer.
    const answer = (choice?.content ?? '').trim();

    const text = requirePublicCompletion(answer, modelId, diagnostics);
    const inputTokens =
      completion.usage?.prompt_tokens ??
      messages.reduce((sum, m) => sum + contentTokenEstimate(m.content), 0);
    const outputTokens = completion.usage?.completion_tokens ?? estimateTokens(text);
    recordModelExecution(modelId, { ok: true, latencyMs: Date.now() - started });
    const result:ChatResult = {
      text,
      finishReason: completion.choices[0]?.finish_reason ?? null,
      modelId,
      apiModel: endpoint.apiModel,
      provider: endpoint.provider,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      cachedInputTokens: completion.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      reasoningTokens: completion.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
      providerRequestId: modelTransportReceipt(endpoint).requestId,
    };
    admission.complete(result,()=>opts.publishAfterVerification?.(text),checkCancellation);
    return Object.freeze(result);
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
    onActivity?: (answerCharacters?:number) => void;
    /** Provider-specific reasoning control. Used only by direct-output workloads. */
    reasoningMode?: ReasoningMode;
    /** Ask the compatible endpoint to constrain the response to one JSON object. */
    json?: boolean;
    responseFormat?: PresentationResponseFormat;
    signal?: AbortSignal;
    credentialOverride?: string;
    beforeDispatch?: (wireBody:string)=>Promise<void>;
  } = {},
): Promise<ChatResult> {
  // Zurelay streams are not verified to carry a usage receipt (live finding 2026-11-05). Until ZURELAY_STREAM_USAGE_VERIFIED=1 the
  // answer is requested as one verified response; callers keep this contract, text arrives once after verification.
  if (MODELS[modelId].provider === 'zurelay' && !zurelayStreamUsageVerified()) return chatCompletionSingleResponse(modelId, messages, opts);
  const started = Date.now();
  opts={...opts,...(opts.responseFormat ? {responseFormat:structuredClone(opts.responseFormat)} : {})};
  try {
    const admission=requireModelSdkAdmission(opts.beforeDispatch,modelId,opts.credentialOverride);
    const checkCancellation=()=>{if(opts.signal?.aborted)throw Object.assign(Error('Build cancelled'),{name:'AbortError',code:'BUILD_CANCELLED'});};
    checkCancellation();
    const endpoint = resolveEndpoint(modelId, opts.credentialOverride);
    const responseFormat = opts.responseFormat
      ? process.env.ZURELAY_JSON_SCHEMA_VERIFIED === '1' ? opts.responseFormat : { type: 'json_object' as const }
      : opts.json ? { type: 'json_object' as const } : undefined;
    messages=snapshotModelEgressPayload(messages,endpoint.apiKey);
    const client = createModelProviderClient(endpoint,async wire=>{
      checkCancellation();
      const current=resolveEndpoint(modelId,opts.credentialOverride);
      if(current.apiKey!==endpoint.apiKey||current.baseUrl!==endpoint.baseUrl||current.apiModel!==endpoint.apiModel||current.provider!==endpoint.provider)modelAdmissionDenied();
      assertProviderControls(wire,modelId,endpoint.provider,opts.reasoningMode);
      if(!isDeepStrictEqual(JSON.parse(wire).response_format,responseFormat))modelAdmissionDenied();
      await opts.beforeDispatch!(wire);checkCancellation();
    },opts.beforeDispatch);
    if (opts.signal?.aborted) {
      const err = new Error('Build cancelled') as Error & { code?: string };
      err.code = 'BUILD_CANCELLED';
      throw err;
    }
    // Sonnet accepts only its default temperature. Never retry a charged request.
    const stream = await withProviderTemperature(modelId === 'claude_sonnet_5_5' ? undefined : opts.temperature ?? 0.4, (temperature) =>
      client.chat.completions.create(
        {
          model: endpoint.apiModel,
          messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
          max_tokens: opts.maxTokens ?? 8192,
          ...(temperature === undefined ? {} : { temperature }),
          ...providerReasoningControls(endpoint.provider, opts.reasoningMode,modelId),
          ...providerPriceControls(modelId, endpoint.provider),
          stream_options: { include_usage: true },
          ...(responseFormat ? { response_format: responseFormat } : {}),
          stream: true,
        } as OpenAI.Chat.ChatCompletionCreateParamsStreaming,
        opts.signal ? { signal: opts.signal } : undefined,
      ),
    );

    let text = '';
    const diagnostics = new CompletionDiagnostics();
    let finishReason: string | null = null;
    let inputTokens = messages.reduce((sum, m) => sum + contentTokenEstimate(m.content), 0);
    let outputTokens = 0;
    let cachedInputTokens = 0, reasoningTokens = 0;

    try {
    for await (const chunk of stream) {
      diagnostics.observe(chunk, true);
      if (opts.signal?.aborted) {
        const err = new Error('Build cancelled') as Error & { code?: string };
        err.code = 'BUILD_CANCELLED';
        throw err;
      }
      const choice = chunk.choices[0];
      const delta = choice?.delta?.content ?? '';
      const reasoningDelta = (choice?.delta as { reasoning_content?: unknown } | undefined)?.reasoning_content;
      // Reasoning-capable providers can spend tens of seconds streaming private
      // reasoning before answer content. That is live transport activity, so it must
      // cancel the silence deadline without becoming answer text or telemetry output.
      if (
        delta ||
        (typeof reasoningDelta === 'string' && reasoningDelta.length > 0) ||
        choice?.finish_reason ||
        chunk.usage
      ) {
        opts.onActivity?.(delta.length||undefined);
        checkCancellation();
      }
      finishReason = choice?.finish_reason ?? finishReason;
      if (delta) {
        if(text.length+delta.length>DEFAULT_BUILDER_BUDGET.maxOutputChars)throw Object.assign(Error('Provider exceeded the bounded output buffer'),{code:'BUILDER_OUTPUT_LIMIT'});
        text += delta;
      }

      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens ?? inputTokens;
        outputTokens = chunk.usage.completion_tokens ?? outputTokens;
        cachedInputTokens = chunk.usage.prompt_tokens_details?.cached_tokens ?? 0;
        reasoningTokens = chunk.usage.completion_tokens_details?.reasoning_tokens ?? 0;
      }
    }
    } catch (error) {
      console.warn('[model-stream-interrupted]', { modelId, ...diagnostics.receipt(), aborted: opts.signal?.aborted === true });
      throw error;
    }

    text = requirePublicCompletion(text, modelId, diagnostics);
    if (!outputTokens) outputTokens = estimateTokens(text);

    recordModelExecution(modelId, { ok: true, latencyMs: Date.now() - started });
    const result:ChatResult = {
      text,
      finishReason,
      modelId,
      apiModel: endpoint.apiModel,
      provider: endpoint.provider,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      cachedInputTokens,
      reasoningTokens,
      providerRequestId: modelTransportReceipt(endpoint).requestId,
    };
    admission.complete(result,()=>opts.onDelta?.(text),checkCancellation);
    return Object.freeze(result);
  } catch (error) {
    recordModelExecution(modelId, { ok: false, latencyMs: Date.now() - started, error });
    throw error;
  }
}

/**
 * Same contract as chatCompletionStream, but one request/one response. Usage is read and validated from the response
 * body by the Zurelay wire verifier BEFORE text is returned, so a missing or inconsistent receipt fails closed exactly as
 * before: the answer is not published, nothing is settled from an estimate, and the existing reservation hold stays for
 * reconciliation. Visible text is delivered once, after verification, mirroring the stream path's post-admission publish.
 */
export async function chatCompletionSingleResponse(
  modelId: ModelId,
  messages: ChatMessage[],
  opts: Parameters<typeof chatCompletionStream>[2] = {},
): Promise<ChatResult> {
  const { onActivity, onDelta, ...single } = opts;
  const result = await chatCompletion(modelId, messages, { ...single, publishAfterVerification: onDelta });
  onActivity?.(result.text.length || undefined);
  return result;
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
    ZURELAY_API_KEY: Boolean(getSecret('ZURELAY_API_KEY')),
  };
}

/** Which transport each model will use with current env */
export function modelTransportStatus(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of ACTIVE_MODEL_IDS) {
    try {
      const ep = resolveEndpoint(id);
      out[id] = `${ep.provider}:${ep.apiModel}`;
    } catch {
      out[id] = 'unconfigured';
    }
  }
  return out;
}
