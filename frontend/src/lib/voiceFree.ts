import {ApiError, getAccessToken} from '@/lib/api';
import {transcribeVoiceAudio} from './voiceApi';
import {transcribeVoiceLocally} from './voiceLocal';
import {encodeVoicePcm} from './voicePcm';
import {VOICE_SAMPLE_RATE, voiceSegments} from './voiceLocalProtocol';
import {voiceClientAwait} from './voiceRequestPolicy';

/** Decode locally, send bounded PCM only to Xroga's authenticated free endpoint.
 * All chunks must finish before publication. No paid or local failure fallback.
 */
export async function transcribeFreeVoiceAudio(audio: Blob, signal: AbortSignal,
  progress: (stage: 'loading' | 'transcribing') => void): Promise<string> {
  const token = await voiceClientAwait(getAccessToken(), signal);
  if (!token) throw new ApiError('Please sign in to use voice input.', 401);
  return transcribeVoiceLocally(audio, signal, progress, async samples => {
    const text: string[] = [];
    try {
      for (const [start, end] of voiceSegments(samples)) {
        signal.throwIfAborted();
        const segment = samples.subarray(start, end);
        const energy = segment.reduce((sum, value) => sum + value * value, 0) / segment.length;
        if (energy < 0.00000025) continue;
        progress('transcribing');
        const pcm = encodeVoicePcm(VOICE_SAMPLE_RATE, [segment]);
        try {
          const blob = new Blob([new Uint8Array(pcm)], {type: 'audio/wav'});
          text.push(await transcribeVoiceAudio(blob, signal, {freeOnly: true, preparedPcm: true, expectedToken: token}));
        } finally {pcm.fill(0);}
      }
      if (!text.length) throw Object.assign(new Error('No speech was heard.'), {name: 'VoiceSilenceError'});
      signal.throwIfAborted();
      return text.join(' ');
    } finally {samples.fill(0);}
  });
}
