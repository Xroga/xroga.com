import {createHash, randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {requireResourceOwner, requireTenantContext, type TenantContext} from '../security/tenantContext.js';
import {getTenantSupabaseAdmin} from '../security/serviceRoleGuard.js';
import {containsCredentialSecretText} from '../security/egress/dataClassification.js';
import type {ProviderReservation} from './providerBudget.js';
import {persistUsageAccounting} from './usageAccounting.js';
import {PostCompletionAccountingError} from './postCompletionAccounting.js';
import {requireVoicePcm} from './voicePcm.js';

const VERSION = 'voice-2026-10-28-v1';
export const VOICE_MODELS = ['gpt-4o-mini-transcribe', 'gpt-4o-transcribe', 'whisper-1'] as const;
export type VoiceModel = typeof VOICE_MODELS[number];
function denied(): never { throw Object.assign(new Error('Voice admission or accounting is unavailable.'), {code: 'PROVIDER_RESERVATION_DENIED', retryable: false}); }
const integer = (value: unknown, expected: number) => (typeof value === 'number' || typeof value === 'string' && /^\d+$/.test(value)) && Number.isSafeInteger(Number(value)) && Number(value) === expected;
const hash = (audio: Buffer) => createHash('sha256').update(audio).digest('hex');

/** Bound publication even when a store/stream does not honor cancellation.
 * A late idempotent accounting reply never resumes a provider attempt.
 */
export function voiceAwait<T>(pending: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(Object.assign(new Error('Voice request cancelled.'), {name: 'AbortError'}));
    if (signal.aborted) {Promise.resolve(pending).catch(() => {}); abort(); return;}
    signal.addEventListener('abort', abort, {once: true});
    Promise.resolve(pending).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/** Same canonical budget RPCs and usage ledger as other provider execution.
 * Rates and bounds are pinned to official compatibility-model documentation,
 * not inferred from compressed upload size or client duration metadata.
 */
export async function beginVoiceRequest(input: {context: TenantContext | undefined; userId: unknown; model: string; audio: Buffer; signal: AbortSignal}) {
  const context = requireTenantContext(input.context); requireResourceOwner(context, input.userId);
  const {model, signal} = input, audio = Buffer.from(input.audio), pcm = requireVoicePcm(audio), audioDigest = hash(audio);
  if (!VOICE_MODELS.includes(model as VoiceModel) || !process.env.SUPABASE_SERVICE_ROLE_KEY || containsCredentialSecretText(audio.toString('latin1'))) denied();
  const credential = process.env.OPENAI_API_KEY; if (!credential) denied();
  const maximumInput = model === 'whisper-1' ? 0 : 16000, maximumOutput = model === 'whisper-1' ? 0 : 2000;
  // Official current per-million input/output rates for these existing models.
  // Whisper uses $0.006/minute, rounded conservatively to whole input seconds.
  const inputRate = model === 'gpt-4o-mini-transcribe' ? 1.25 : 2.5, outputRate = model === 'gpt-4o-mini-transcribe' ? 5 : 10;
  const reservedMicroUsd = Math.max(1000, Math.ceil(model === 'whisper-1' ? Math.ceil(pcm.seconds) * 100 : (maximumInput * inputRate + maximumOutput * outputRate) * 1.1));
  const route = 'voice.' + model, idempotencyKey = randomUUID(), db = getTenantSupabaseAdmin(context);
  let dispatched = false, completed = false, settledVerified = false, active = true;
  const check = () => {
    signal.throwIfAborted(); requireResourceOwner(context, input.userId);
    if (!active || process.env.OPENAI_API_KEY !== credential) denied();
  };
  check();
  const reserve = () => db.rpc('reserve_xroga_provider_budget', {p_user_id: context.userId, p_idempotency_key: idempotencyKey, p_purpose: 'daily_work', p_internal_route: route, p_price_version: VERSION, p_estimated_input_tokens: maximumInput, p_maximum_output_tokens: maximumOutput, p_reservation_micro_usd: reservedMicroUsd}).abortSignal(signal);
  let result;
  try {
    result = await voiceAwait(reserve(), signal);
    if (result.error && /active_billing_cycle_required/i.test(result.error.message)) {
      check(); const cycle = await voiceAwait(db.rpc('ensure_xroga_free_cycle', {p_user_id: context.userId}).abortSignal(signal), signal); if (cycle.error) denied();
      check(); result = await voiceAwait(reserve(), signal);
    }
  } catch { denied(); }
  const row = result.data;
  if (result.error || !row || Array.isArray(row) || typeof row.id !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(row.id)
    || row.user_id !== context.userId || row.idempotency_key !== idempotencyKey || row.internal_route !== route || row.price_version !== VERSION
    || row.purpose !== 'daily_work' || row.status !== 'reserved' || !integer(row.estimated_input_tokens, maximumInput)
    || !integer(row.maximum_output_tokens, maximumOutput) || !integer(row.reserved_micro_usd, reservedMicroUsd)) denied();
  const reservation: ProviderReservation = {id: row.id, reservedMicroUsd, priceVersion: VERSION};
  const audit = async (outcome: 'ADMITTED' | 'COMPLETED', usage?: {input: number; output: number; seconds?: number; cost: number}) => {
    const event = {id: randomUUID(), user_id: context.userId, actor_id: context.userId, project_id: null, environment_id: null,
      action: 'voice_provider_request', target_type: 'manual_audio_digest', target_id: audioDigest, outcome,
      reason: 'authenticated_manual_voice', correlation_id: context.correlationId, evidence_reference: reservation.id,
      metadata: {model, audioDigest, frames: pcm.frames, seconds: pcm.seconds, priceVersion: VERSION, reservationId: reservation.id, reservedMicroUsd, ...(usage ? {usage} : {})}};
    const {data, error} = await voiceAwait(db.from('production_audit_log').insert(event).select('id,user_id,actor_id,action,outcome,metadata').abortSignal(signal).single(), signal);
    if (error || !data || data.id !== event.id || data.user_id !== context.userId || data.actor_id !== context.userId
      || data.action !== event.action || data.outcome !== outcome || !isDeepStrictEqual(data.metadata, event.metadata)) denied();
  };
  const fail = async (_error: unknown) => {
    active = false;
    if (settledVerified) return;
    // Once bytes were sent, keep the full hold even if the caller disconnects.
    // Failure-record uncertainty is terminal and can never authorize fallback.
    const failureSignal = AbortSignal.timeout(2000);
    const {error} = await voiceAwait(db.rpc('release_xroga_provider_budget', {p_user_id: context.userId, p_reservation_id: reservation.id, p_error_category: 'unknown', p_pending_reconciliation: dispatched || completed}).abortSignal(failureSignal), failureSignal);
    if (error) denied();
  };
  try { check(); await audit('ADMITTED'); check(); } catch (error) { await fail(error); throw error; }
  return Object.freeze({
    credential,
    beforeDispatch(wireModel: string, wireAudio: Buffer) {
      check(); if (dispatched || wireModel !== model || hash(wireAudio) !== audioDigest) denied(); dispatched = true;
    },
    check,
    async complete(usage: unknown, requestId: string | null) {
      if (!dispatched || completed) denied(); completed = true;
      try {
        if (!requestId || !/^[A-Za-z0-9_-]{1,160}$/.test(requestId) || containsCredentialSecretText(requestId) || !usage || typeof usage !== 'object') denied();
        const value = usage as Record<string, unknown>;
        let inputTokens = 0, outputTokens = 0, seconds: number | undefined, cost: number;
        if (model === 'whisper-1') {
          if (value.type !== 'duration' || typeof value.seconds !== 'number' || !Number.isFinite(value.seconds) || value.seconds <= 0 || value.seconds > Math.ceil(pcm.seconds)) denied();
          seconds = value.seconds; cost = Math.ceil(seconds * 100);
        } else {
          const details = value.input_token_details as {text_tokens?: unknown; audio_tokens?: unknown} | undefined;
          const valid = (n: unknown, maximum: number): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= maximum;
          if (value.type !== 'tokens' || !valid(value.input_tokens, maximumInput) || !valid(value.output_tokens, maximumOutput)
            || value.total_tokens !== value.input_tokens + value.output_tokens || !details
            || !valid(details.audio_tokens, maximumInput) || !valid(details.text_tokens, maximumInput)
            || details.audio_tokens + details.text_tokens !== value.input_tokens) denied();
          inputTokens = value.input_tokens; outputTokens = value.output_tokens; cost = Math.ceil(inputTokens * inputRate + outputTokens * outputRate);
        }
        if (!Number.isSafeInteger(cost) || cost < 0 || cost > reservedMicroUsd) denied();
        check();
        const {data, error} = await voiceAwait(db.rpc('settle_xroga_provider_budget', {p_user_id: context.userId, p_reservation_id: reservation.id, p_actual_micro_usd: cost, p_provider_request_id: requestId,
          p_actual_input_tokens: inputTokens, p_cached_input_tokens: 0, p_output_tokens: outputTokens, p_reasoning_tokens: 0, p_tool_calls: 0, p_search_calls: 0}).abortSignal(signal), signal);
        if (error || !data || Array.isArray(data) || data.id !== reservation.id || data.user_id !== context.userId || data.status !== 'settled'
          || data.internal_route !== route || data.price_version !== VERSION || data.provider_request_id !== requestId
          || !integer(data.reserved_micro_usd, reservedMicroUsd) || !integer(data.settled_micro_usd, cost)
          || !integer(data.actual_input_tokens, inputTokens) || !integer(data.output_tokens, outputTokens)
          || ['cached_input_tokens', 'reasoning_tokens', 'tool_calls', 'search_calls'].some(key => !integer(data[key], 0))) denied();
        settledVerified = true; check();
        await voiceAwait(persistUsageAccounting(context, {receiptId: reservation.id, modelId: model.replace(/[^a-z0-9]/g, '_'), poolRole: 'voice', inputTokens, outputTokens, costUsd: cost / 1000000}), signal);
        check(); await audit('COMPLETED', {input: inputTokens, output: outputTokens, ...(seconds === undefined ? {} : {seconds}), cost}); check();
      } catch { throw new PostCompletionAccountingError(); }
    },
    fail,
    close() {active = false;},
  });
}
