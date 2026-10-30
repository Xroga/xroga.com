import { API_URL, ApiError, getAccessToken,fetchApiResponse } from '@/lib/api';
import {normalizeVoiceAudio} from './voicePcm';
import {voiceClientAwait} from './voiceRequestPolicy';

export async function transcribeVoiceAudio(audio: Blob, cancellation?: AbortSignal,
  options?: {freeOnly: true; preparedPcm: true; expectedToken: string}): Promise<string> {
  const signal = AbortSignal.any([AbortSignal.timeout(60000), ...(cancellation ? [cancellation] : [])]);
  signal.throwIfAborted();
  const token = await voiceClientAwait(getAccessToken(), signal);
  if (!token) throw new ApiError('Please sign in to use voice input.', 401);
  if (options && token !== options.expectedToken) throw new ApiError('Your voice session changed. Record again in the current account.', 401, {code: 'VOICE_SESSION_CHANGED'});
  const recording = options?.preparedPcm ? audio : await voiceClientAwait(normalizeVoiceAudio(audio), signal);
  if (recording.size < 512 || recording.size > 8 * 1024 * 1024) throw new ApiError('Invalid voice recording size.', 422);
  const current = async () => {
    signal.throwIfAborted();
    if (await voiceClientAwait(getAccessToken(), signal) !== token) throw new ApiError('Your voice session changed. Record again in the current account.', 401, {code: 'VOICE_SESSION_CHANGED'});
    signal.throwIfAborted();
  };
  await current();

  const response = await voiceClientAwait(fetchApiResponse(`${API_URL}/api/voice/${options?.freeOnly ? 'transcribe-free' : 'transcribe'}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'audio/wav',
    },
    body: recording,
    signal,
  }), signal);
  try {await current();} catch (error) {void response.body?.cancel().catch(() => {}); throw error;}
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    if (!reader) throw new Error('Missing voice response.');
    for (;;) {
      const part = await voiceClientAwait(reader.read(), signal);
      if (part.done) break;
      size += part.value.byteLength; if (size > 128000) throw new Error('Voice response too large.'); chunks.push(part.value);
    }
  } finally {void reader?.cancel().catch(() => {}); reader?.releaseLock();}
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
  if (!text || text.length > 16000) throw new ApiError('No verified speech was received.', 422, {code: 'VOICE_TRANSCRIPTION_DENIED'});
  return text;
}
