import { VOICE_MAX_SECONDS, VOICE_MAX_BYTES, VOICE_RUNTIME_PATH, VOICE_SAMPLE_RATE, validateVoiceSamples, type VoiceWorkerReply } from './voiceLocalProtocol';

type Progress = (stage: 'loading' | 'transcribing') => void;
const abortError = () => new DOMException('Voice typing cancelled.', 'AbortError');

/** A dedicated worker per utterance guarantees cancel terminates inference and releases model memory. */
export function recognizeVoiceSamples(samples: Float32Array, signal: AbortSignal, progress: Progress,
  createWorker = () => new Worker(`${VOICE_RUNTIME_PATH}worker.js`, { type: 'module' }), deadlineMs = 600000 + samples.length / VOICE_SAMPLE_RATE * 6000): Promise<string> {
  validateVoiceSamples(samples);
  if (signal.aborted) { samples.fill(0); return Promise.reject(abortError()); }
  return new Promise((resolve, reject) => {
    let worker: Worker | undefined, timer: ReturnType<typeof setTimeout> | undefined, finished = false;
    const finish = (error?: Error, text?: string) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      worker?.terminate();
      if (samples.byteLength) samples.fill(0);
      if (error) reject(error); else resolve(text!);
    };
    const cancel = () => finish(abortError());
    try {
      worker = createWorker();
      worker.onmessage = ({ data }: MessageEvent<VoiceWorkerReply>) => {
        if (finished || signal.aborted) return;
        if (data?.type === 'progress' && ['loading', 'transcribing'].includes(data.stage)) progress(data.stage);
        else if (data?.type === 'complete' && typeof data.text === 'string' && data.text.trim() && data.text.length <= 100000) finish(undefined, data.text.trim());
        else finish(new Error('Local speech recognition failed.'));
      };
      worker.onerror = () => finish(new Error('Local speech recognition unavailable.'));
      worker.onmessageerror = () => finish(new Error('Invalid local speech result.'));
      signal.addEventListener('abort', cancel, { once: true });
      timer = setTimeout(() => finish(new Error('Local speech recognition timed out.')), deadlineMs);
      worker.postMessage(samples, [samples.buffer as ArrayBuffer]);
    } catch { finish(new Error('Local speech recognition unavailable.')); }
  });
}

export async function transcribeVoiceLocally(audio: Blob, signal: AbortSignal, progress: Progress): Promise<string> {
  if (signal.aborted) throw abortError();
  if (audio.size < 512 || audio.size > VOICE_MAX_BYTES || typeof OfflineAudioContext === 'undefined') {
    throw new Error('Unsupported voice recording.');
  }
  const context = new OfflineAudioContext(1, 1, VOICE_SAMPLE_RATE);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  try {
    const decoded = await Promise.race([
      context.decodeAudioData(await audio.arrayBuffer()),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Voice preparation timed out.')), 15000);
        cancel = () => reject(abortError());
        signal.addEventListener('abort', cancel, { once: true });
        if (signal.aborted) cancel();
      }),
    ]);
    clearTimeout(timer);
    if (cancel) signal.removeEventListener('abort', cancel);
    if (signal.aborted) throw abortError();
    if (!Number.isFinite(decoded.duration) || decoded.duration > VOICE_MAX_SECONDS || decoded.numberOfChannels > 8) throw new Error('Invalid voice duration.');
    const samples = new Float32Array(decoded.length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
      const values = decoded.getChannelData(channel);
      for (let frame = 0; frame < samples.length; frame++) samples[frame] += values[frame] / decoded.numberOfChannels;
      values.fill(0);
    }
    if (decoded.sampleRate !== VOICE_SAMPLE_RATE) throw new Error('Unsupported voice sample rate.');
    return await recognizeVoiceSamples(samples, signal, progress);
  } finally {
    clearTimeout(timer);
    if (cancel) signal.removeEventListener('abort', cancel);
  }
}
