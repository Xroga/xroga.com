import express, {Router} from 'express';
import type {AuthRequest} from '../middleware/auth.js';
import {requireResourceOwner, requireTenantContext} from '../security/tenantContext.js';
import {containsCredentialSecretText} from '../security/egress/dataClassification.js';
import {AuthorityError} from '../security/authority/enforce.js';
import {beginVoiceRequest, VOICE_MODELS, voiceAwait} from '../ai/voiceBudget.js';
import {requireVoicePcm} from '../ai/voicePcm.js';
import {isTerminalModelFailure} from '../ai/providerRuntime.js';

const router = Router();
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
async function boundedVoiceResponse(response: Response, signal: AbortSignal): Promise<unknown> {
  const reader = response.body?.getReader(); if (!reader) throw new Error('Missing speech receipt.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      signal.throwIfAborted(); const part = await voiceAwait(reader.read(), signal); signal.throwIfAborted();
      if (part.done) break;
      size += part.value.byteLength; if (size > 65536) throw new Error('Speech receipt too large.'); chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
}

router.post('/transcribe', express.raw({type: ['audio/*', 'application/octet-stream'], limit: MAX_AUDIO_BYTES}), async (req: AuthRequest, res) => {
  const controller = new AbortController();
  const abort = () => controller.abort(); req.once('aborted', abort); res.once('close', abort);
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]);
  const requestActive = () => { if (req.aborted || res.destroyed) controller.abort(); signal.throwIfAborted(); };
  let current: Awaited<ReturnType<typeof beginVoiceRequest>> | undefined;
  try {
    const context = requireTenantContext(req.tenantContext); requireResourceOwner(context, req.userId);
    const audio = Buffer.isBuffer(req.body) ? Buffer.from(req.body) : Buffer.alloc(0);
    requireVoicePcm(audio);
    if (containsCredentialSecretText(audio.toString('latin1'))) throw new AuthorityError('VOICE_SECRET_EGRESS_DENIED');
    const configuredModel = process.env.OPENAI_TRANSCRIBE_MODEL?.trim();
    if (configuredModel && !VOICE_MODELS.includes(configuredModel as typeof VOICE_MODELS[number])) throw new AuthorityError('VOICE_MODEL_NOT_ADMITTED');
    const models = [...new Set([configuredModel || 'gpt-4o-mini-transcribe', 'gpt-4o-transcribe', 'whisper-1'])];
    for (const model of models) {
      requestActive();
      current = await beginVoiceRequest({context, userId: context.userId, model, audio, signal});
      try {
        const form = new FormData();
        form.append('file', new Blob([new Uint8Array(audio)], {type: 'audio/wav'}), 'xroga-voice.wav');
        form.append('model', model);
        form.append(
          'prompt',
          'Transcribe the speaker faithfully in the language they actually use. ' +
            'Do not translate, summarize, answer, or rewrite. Preserve punctuation, numbers, ' +
            'names, commands, product names, and technical terms. The product name is Xroga, ' +
            'spelled X-r-o-g-a and commonly pronounced "X Roga". If the speaker says X Roga, ' +
            'ex roga, Acroga, or a close recognition variant, write the brand as Xroga.',
        );
        requestActive(); current.beforeDispatch(model, audio);
        const upstream = await voiceAwait(fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST', redirect: 'manual',
          headers: {Authorization: `Bearer ${current.credential}`}, body: form, signal,
        }), signal);
        requestActive(); current.check();
        if (upstream.redirected || upstream.status >= 300 && upstream.status < 400 || upstream.status === 401 || upstream.status === 403) {
          void upstream.body?.cancel().catch(() => {}); throw new AuthorityError('VOICE_PROVIDER_AUTHORIZATION_DENIED');
        }
        if (!upstream.ok) {
          void upstream.body?.cancel().catch(() => {});
          throw Object.assign(new Error('Speech provider unavailable.'), {status: upstream.status});
        }
        const body = await boundedVoiceResponse(upstream, signal) as {text?: unknown; usage?: unknown; language?: unknown} | null;
        requestActive(); current.check();
        await current.complete(body?.usage, upstream.headers.get('x-request-id'));
        requestActive(); current.check();
        const text = typeof body?.text === 'string' ? body.text.trim() : '';
        if (!text || text.length > 16000 || containsCredentialSecretText(text)) throw new AuthorityError('VOICE_TRANSCRIPT_NOT_ADMITTED');
        // A current valid accounting receipt precedes publication. Provider
        // errors, metadata and raw recordings never enter public errors/logs.
        res.json({text, provider: 'openai', model, language: typeof body?.language === 'string' && /^[A-Za-z -]{1,40}$/.test(body.language) && !containsCredentialSecretText(body.language) ? body.language : 'auto'});
        return;
      } catch (error) {
        await current.fail(error);
        if (signal.aborted || isTerminalModelFailure(error)) throw error;
        const status = (error as {status?: number}).status;
        // Only ordinary provider availability failures can use a fresh hold
        // for the next existing model. Unknown completed work cannot retry.
        if (status !== 429 && !(typeof status === 'number' && status >= 500)) throw error;
      } finally { current.close(); current = undefined; }
    }
    throw Object.assign(new Error('Speech provider unavailable.'), {code: 'VOICE_PROVIDER_UNAVAILABLE'});
  } catch (error) {
    const ordinary = (error as {code?: string})?.code === 'VOICE_PROVIDER_UNAVAILABLE';
    if (!res.headersSent && !res.destroyed) res.status(503).json({error: 'Could not transcribe that audio. Please try again.', code: ordinary ? 'VOICE_PROVIDER_UNAVAILABLE' : 'VOICE_TRANSCRIPTION_DENIED'});
  } finally {
    current?.close(); req.removeListener('aborted', abort); res.removeListener('close', abort); controller.abort();
  }
});
export default router;
