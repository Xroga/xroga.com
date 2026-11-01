import express, {Router} from 'express';
import type {AuthRequest} from '../middleware/auth.js';
import {requireResourceOwner, requireTenantContext} from '../security/tenantContext.js';
import {containsCredentialSecretText} from '../security/egress/dataClassification.js';
import {AuthorityError} from '../security/authority/enforce.js';
import {beginVoiceRequest, FREE_VOICE_MODEL, voiceAwait} from '../ai/voiceBudget.js';
import {requireVoicePcm} from '../ai/voicePcm.js';

const router = Router();
/** Product vocabulary only. Measured on 17 human clips (Urdu, Hindi, Arabic, English): no harm to word error
 * or script, and fewer technical-term errors. It names terms, never instructions, and no language. */
export const VOICE_VOCABULARY = 'Xroga, Next.js, TypeScript, Supabase, Cloudflare, Google Cloud Run, GitHub, React, API, Claude, Codex.';
// Per-instance burst guard only. Durable spend and quota truth stays in the
// provider budget reservation below, never in process memory.
const MAX_CONCURRENT_PER_USER = 2;
const inFlight = new Map<string, number>();

async function receipt(response: Response, signal: AbortSignal): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Missing speech receipt.');
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    for (;;) {
      const part = await voiceAwait(reader.read(), signal); signal.throwIfAborted();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 65536) throw new Error('Speech receipt too large.');
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {void reader.cancel().catch(() => {}); reader.releaseLock();}
}

/** Free-plan-only dictation. No paid-provider or authorization-denial fallback. */
router.post('/transcribe-free', express.raw({type: ['audio/wav'], limit: 8 * 1024 * 1024}), async (req: AuthRequest, res) => {
  const controller = new AbortController();
  const abort = () => controller.abort(); req.once('aborted', abort); res.once('close', abort);
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]);
  const requestActive = () => {if (req.aborted || res.destroyed) controller.abort(); signal.throwIfAborted();};
  let current: Awaited<ReturnType<typeof beginVoiceRequest>> | undefined, slot: string | undefined;
  try {
    requestActive();
    const context = requireTenantContext(req.tenantContext); requireResourceOwner(context, req.userId);
    const audio = Buffer.isBuffer(req.body) ? Buffer.from(req.body) : Buffer.alloc(0);
    requireVoicePcm(audio);
    let energy = 0;
    for (let at = 44; at < audio.length; at += 2) energy += audio.readInt16LE(at) ** 2;
    if (energy / ((audio.length - 44) / 2) < 256) {
      res.status(422).json({error: 'No speech was heard. Check your microphone and record again.', code: 'VOICE_NO_SPEECH'}); return;
    }
    if ((inFlight.get(context.userId) ?? 0) >= MAX_CONCURRENT_PER_USER) {
      res.status(429).json({error: 'Too many voice requests at once. Please wait a moment and retry.', code: 'VOICE_BUSY'}); return;
    }
    inFlight.set(context.userId, (inFlight.get(context.userId) ?? 0) + 1); slot = context.userId;
    current = await beginVoiceRequest({context, userId: context.userId, audio, signal, model: FREE_VOICE_MODEL, provider: 'cloudflare-free'});
    requestActive();
    // The account is validated and frozen by admission. Neither the client nor
    // provider output controls the destination, credential or model.
    const url = `https://api.cloudflare.com/client/v4/accounts/${current.accountId}/ai/run/${FREE_VOICE_MODEL}`;
    current.beforeDispatch(FREE_VOICE_MODEL, audio);
    const upstream = await voiceAwait(fetch(url, {method: 'POST', redirect: 'manual', signal,
      headers: {Authorization: `Bearer ${current.credential}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({audio: audio.toString('base64'), task: 'transcribe', vad_filter: true, condition_on_previous_text: false, initial_prompt: VOICE_VOCABULARY}),
    }), signal);
    requestActive(); current.check();
    if (upstream.redirected || upstream.status >= 300 && upstream.status < 400 || upstream.status === 401 || upstream.status === 403) {
      void upstream.body?.cancel().catch(() => {}); throw new AuthorityError('VOICE_PROVIDER_AUTHORIZATION_DENIED');
    }
    if (upstream.status === 429) {
      void upstream.body?.cancel().catch(() => {});
      throw Object.assign(new Error('Free speech allowance reached.'), {code: 'VOICE_QUOTA_EXHAUSTED'});
    }
    if (!upstream.ok) {
      void upstream.body?.cancel().catch(() => {});
      throw Object.assign(new Error('Speech provider unavailable.'), {code: 'VOICE_PROVIDER_UNAVAILABLE'});
    }
    const body = await receipt(upstream, signal) as {
      success?: unknown; errors?: unknown; result?: {text?: unknown; transcription_info?: {duration?: unknown; language?: unknown}};
    } | null;
    requestActive(); current.check();
    if (body?.success !== true || !Array.isArray(body.errors) || body.errors.length || !body.result) throw new AuthorityError('VOICE_RECEIPT_NOT_ADMITTED');
    const duration = body.result.transcription_info?.duration;
    await current.complete({type: 'cloudflare-free-duration', seconds: duration}, upstream.headers.get('cf-ray'));
    requestActive(); current.check();
    const text = typeof body.result.text === 'string' ? body.result.text.trim() : '';
    // An empty result is a verified, settled receipt for audio with no speech. It is
    // returned as empty text so a quiet passage never invents words or fails a long recording.
    if (text.length > 16000 || containsCredentialSecretText(text)) throw new AuthorityError('VOICE_TRANSCRIPT_NOT_ADMITTED');
    const language = body.result.transcription_info?.language;
    res.json({text, provider: 'cloudflare-free', model: FREE_VOICE_MODEL,
      language: typeof language === 'string' && /^[A-Za-z -]{1,40}$/.test(language) && !containsCredentialSecretText(language) ? language : 'auto'});
  } catch (error) {
    try {await current?.fail(error);} catch { /* Accounting uncertainty stays terminal. */ }
    if (!res.headersSent && !res.destroyed) {
      const code = (error as {code?: string})?.code;
      if (code === 'VOICE_QUOTA_EXHAUSTED') {
        res.status(429).json({error: "Today's free voice transcription allowance is used up. Your recording is kept; retry later or type instead.", code}); return;
      }
      const unavailable = code === 'VOICE_PROVIDER_UNAVAILABLE';
      res.status(503).json({error: unavailable ? 'Voice transcription is temporarily busy. Please retry your recording.' : 'Could not verify this voice transcription. Your typed text is unchanged.',
        code: unavailable ? 'VOICE_PROVIDER_UNAVAILABLE' : 'VOICE_TRANSCRIPTION_DENIED'});
    }
  } finally {
    if (slot) {const left = (inFlight.get(slot) ?? 1) - 1; if (left > 0) inFlight.set(slot, left); else inFlight.delete(slot);}
    current?.close(); req.removeListener('aborted', abort); res.removeListener('close', abort); controller.abort();
  }
});

export default router;
