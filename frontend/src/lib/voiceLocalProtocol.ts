// Recognition downloads public weights only. The composer retains its normal draft/Send behavior.
export const VOICE_MODEL = 'onnx-community/whisper-small';
export const VOICE_MODEL_REVISION = '36050c46d777d46dc4b5f43f6d90574fc38f8732';
export const VOICE_RUNTIME_PATH = '/voice-runtime/v1/';
export const VOICE_SAMPLE_RATE = 16000;
export const VOICE_RECORDING_MS = 30 * 60 * 1000;
export const VOICE_MAX_BYTES = 64 * 1024 * 1024;
export const VOICE_MAX_SECONDS = VOICE_RECORDING_MS / 1000 + 5;
/** Partition every sample exactly once, preferring a quiet frame near each model window end. */
export function voiceSegments(samples: Float32Array): Array<[number, number]> {
  const result: Array<[number, number]> = [];
  const window = 25 * VOICE_SAMPLE_RATE, frame = VOICE_SAMPLE_RATE / 20;
  let start = 0;
  while (start < samples.length) {
    let end = Math.min(start + window, samples.length);
    if (end < samples.length) {
      let best = Infinity, quietEnd = end;
      for (let at = start + 20 * VOICE_SAMPLE_RATE; at + frame <= end; at += frame) {
        let energy = 0;
        for (let i = at; i < at + frame; i++) energy += samples[i] * samples[i];
        if (energy < best) { best = energy; quietEnd = at + frame / 2; }
      }
      if (best / frame < 0.0001) end = quietEnd;
    }
    result.push([start, end]); start = end;
  }
  return result;
}
export type VoiceWorkerReply =
  | { type: 'progress'; stage: 'loading' | 'transcribing'; percent?: number }
  | { type: 'ready' }
  | { type: 'complete'; text: string }
  | { type: 'error'; code?: 'download' | 'silence' | 'engine' };

export function validateVoiceSamples(samples: unknown): asserts samples is Float32Array {
  if (!(samples instanceof Float32Array) || samples.length < 1600
    || samples.length > VOICE_SAMPLE_RATE * VOICE_MAX_SECONDS
    || samples.some(value => !Number.isFinite(value) || Math.abs(value) > 1.01)) {
    throw new Error('Invalid voice samples.');
  }
}

/** Whisper identifies language by the highest logit among its language tokens. Never default to English. */
export function selectVoiceLanguage(logits: ArrayLike<number>, languageTokens: Record<string, number>): string {
  let language = '', best = -Infinity;
  for (const [token, id] of Object.entries(languageTokens)) {
    if (!/^<\|[a-z]{2,3}\|>$/.test(token) || !Number.isSafeInteger(id) || id < 0 || id >= logits.length) throw new Error('Invalid language metadata.');
    const score = logits[id];
    if (!Number.isFinite(score)) throw new Error('Invalid language score.');
    if (score > best) { best = score; language = token.slice(2, -2); }
  }
  if (!language) throw new Error('Language detection unavailable.');
  return language;
}

/** Reaching the model token limit is incomplete audio processing, never successful dictation. */
export function voiceCompletionGuard(endToken: number | number[]) {
  const tokens = Array.isArray(endToken) ? endToken : [endToken];
  if (!tokens.length || tokens.some(token => !Number.isSafeInteger(token) || token < 0)) throw new Error('Missing decoder stop token.');
  let last: number | undefined;
  return {
    put(values: bigint[][]) { last = Number(values[0]?.at(-1)); },
    end() {
      if (last === undefined || !tokens.includes(last)) throw new Error('Speech decoding stopped before completion.');
      last = undefined;
    },
  };
}
