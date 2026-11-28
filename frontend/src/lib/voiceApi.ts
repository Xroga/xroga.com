import { API_URL, ApiError, getAccessToken,fetchApiResponse } from '@/lib/api';
import {isVoiceLanguage} from './voiceLanguage';
import {normalizeVoiceAudio} from './voicePcm';
import {sameVoiceAccount, voiceClientAwait, voiceDeadline} from './voiceRequestPolicy';

/** Starts the voice backend while the user is still speaking. Scale-to-zero means the first request after
 * idle waits for a cold start; a simple no-credential request lets that happen during recording.
 * The response is ignored and nothing is sent. */
export function warmVoiceBackend(): void {
  try { void fetch(`${API_URL}/api/voice/transcribe-free`, {method: 'GET', mode: 'no-cors', cache: 'no-store', credentials: 'omit'}).catch(() => {}); } catch { /* best effort */ }
}

/** Longest the connection is kept open after the transcript, while the server finishes its records. */
const AFTER_TRANSCRIPT_MS = 20000;

/** Reads out the rest of an early-text reply. Closing it early would end the request on the server
 * before its accounting finished. */
async function drainVoiceReply(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  const limit = setTimeout(() => {void reader.cancel().catch(() => {});}, AFTER_TRANSCRIPT_MS);
  try {while (!(await reader.read()).done);} catch { /* The transcript is already delivered. */ } finally {clearTimeout(limit);}
}

export async function transcribeVoiceAudio(audio: Blob, cancellation?: AbortSignal,
  options?: {freeOnly: true; preparedPcm: true; expectedToken: string; language?: string}): Promise<string> {
  const signal = voiceDeadline(60000, cancellation);
  signal.throwIfAborted();
  const token = await voiceClientAwait(getAccessToken(), signal);
  if (!token) throw new ApiError('Please sign in to use voice input.', 401);
  if (options && !sameVoiceAccount(options.expectedToken, token)) throw new ApiError('Your voice session changed. Record again in the current account.', 401, {code: 'VOICE_SESSION_CHANGED'});
  const recording = options?.preparedPcm ? audio : await voiceClientAwait(normalizeVoiceAudio(audio), signal);
  if (recording.size < 512 || recording.size > 8 * 1024 * 1024) throw new ApiError('Invalid voice recording size.', 422);
  const current = async () => {
    signal.throwIfAborted();
    if (!sameVoiceAccount(token, await voiceClientAwait(getAccessToken(), signal))) throw new ApiError('Your voice session changed. Record again in the current account.', 401, {code: 'VOICE_SESSION_CHANGED'});
    signal.throwIfAborted();
  };
  await current();

  // Cancellation and the deadline reach the connection only until the transcript has arrived.
  const wire = new AbortController(), forward = () => wire.abort();
  signal.addEventListener('abort', forward, {once: true});
  const spoken = options?.freeOnly && isVoiceLanguage(options.language) ? `?language=${encodeURIComponent(options.language)}` : '';
  const response = await voiceClientAwait(fetchApiResponse(`${API_URL}/api/voice/${options?.freeOnly ? 'transcribe-free' : 'transcribe'}${spoken}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'audio/wav',
      ...(options?.freeOnly ? {Accept: 'application/x-ndjson'} : {}),
    },
    body: recording,
    signal: wire.signal,
  }), signal);
  try {await current();} catch (error) {void response.body?.cancel().catch(() => {}); throw error;}
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = []; let size = 0, handedOver = false;
  const lines = response.ok && /^application\/x-ndjson/.test(response.headers.get('content-type') ?? '');
  try {
    if (!reader) throw new Error('Missing voice response.');
    for (;;) {
      const part = await voiceClientAwait(reader.read(), signal);
      if (part.done) break;
      const end = lines ? part.value.indexOf(10) : -1, value = end < 0 ? part.value : part.value.subarray(0, end);
      size += value.byteLength; if (size > 128000) throw new Error('Voice response too large.'); chunks.push(value);
      if (end >= 0) {handedOver = true; break;}
    }
    if (lines && !handedOver) throw new Error('Incomplete voice response.');
  } finally {
    if (handedOver && reader) {signal.removeEventListener('abort', forward); void drainVoiceReply(reader);}
    else {void reader?.cancel().catch(() => {}); reader?.releaseLock();}
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.byteLength;}
  const payload = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)) as
    | { text?: unknown; error?: unknown; code?: unknown }
    | null;
  await current();

  if (!response.ok) {
    throw new ApiError(
      typeof payload?.error === 'string'
        ? payload.error
        : 'Could not transcribe that audio.',
      response.status,
      {
        code: typeof payload?.code === 'string' ? payload.code : 'VOICE_TRANSCRIPTION_FAILED',
      },
    );
  }

  const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
  if (text.length > 16000 || !text && !options?.freeOnly) throw new ApiError('No verified speech was received.', 422, {code: 'VOICE_TRANSCRIPTION_DENIED'});
  return text;
}
