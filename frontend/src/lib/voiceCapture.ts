/** Microphone capture as raw PCM. A recorder container (webm/mp4) cannot be cut
 * into independently decodable pieces mid-stream, so segmenting long dictation
 * needs samples. Built-in echo cancellation, noise suppression and automatic
 * gain are requested as preferences; no extra filtering is applied.
 */
export const VOICE_WORKLET_PATH = '/voice-capture-worklet.js';

export function voiceCaptureSupported(): boolean {
  return typeof window !== 'undefined' && typeof AudioContext !== 'undefined' && typeof AudioWorkletNode !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia;
}

/** Safari on iOS only lets an audio context start from the user's tap itself, so it is created and
 * started synchronously in the click handler, before any await. Returns undefined when unsupported. */
export function prepareVoiceAudioContext(): AudioContext | undefined {
  try {
    if (typeof AudioContext === 'undefined') return undefined;
    const context = new AudioContext({ latencyHint: 'interactive' });
    void context.resume().catch(() => {});
    return context;
  } catch {
    return undefined;
  }
}

async function microphone(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: { ideal: 1 } },
    });
  } catch (error) {
    // Unsupported preferences are not a reason to refuse dictation. Safari and some Android
    // builds reject unknown constraints with an overconstrained or type error; permission and
    // device errors are real and are passed on unchanged.
    const name = (error as { name?: string })?.name;
    if (name === 'OverconstrainedError' || name === 'TypeError' || name === 'ConstraintNotSatisfiedError') {
      return navigator.mediaDevices.getUserMedia({ audio: true });
    }
    throw error;
  }
}

/** How long the microphone audio engine may take to start, or to come back after Safari pauses it. */
export const AUDIO_START_TIMEOUT_MS = 4000;
export const AUDIO_RECOVERY_TIMEOUT_MS = 2000;
/** How long to wait for the audio engine to hand over the last samples after Stop. */
export const AUDIO_FLUSH_TIMEOUT_MS = 250;

/** resume() can stay pending forever on iOS while another app or the system owns the audio session, so
 * it is bounded. True only when the context really is running afterwards. */
async function resumeAudio(context: AudioContext, timeoutMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      context.resume(),
      new Promise<void>(resolve => { timer = setTimeout(resolve, timeoutMs); }),
    ]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
  return context.state === 'running';
}

export interface VoiceCapture {
  rate: number;
  /** Starts delivering sample batches. Resolves when the first batch arrives. */
  begin(onSamples: (samples: Float32Array) => void): Promise<void>;
  /** Delivers the samples still held by the audio engine, then stops. */
  finish(): Promise<void>;
  stop(): void;
}

export async function openVoiceCapture(onInterrupted: () => void, signal: AbortSignal, prepared?: AudioContext): Promise<VoiceCapture> {
  let context: AudioContext | undefined = prepared, stopped = false;
  let stream: MediaStream;
  try { stream = await microphone(); } catch (error) { void prepared?.close().catch(() => {}); throw error; }
  const stop = () => {
    if (stopped) return;
    stopped = true;
    stream.getTracks().forEach(track => track.stop());
    void context?.close().catch(() => {});
  };
  try {
    if (signal.aborted) throw new DOMException('Voice typing cancelled.', 'AbortError');
    context = context ?? new AudioContext({ latencyHint: 'interactive' });
    await context.audioWorklet.addModule(VOICE_WORKLET_PATH);
    if (signal.aborted) throw new DOMException('Voice typing cancelled.', 'AbortError');
    if (!await resumeAudio(context, AUDIO_START_TIMEOUT_MS)) throw new Error('The microphone did not start.');
    if (signal.aborted) throw new DOMException('Voice typing cancelled.', 'AbortError');
  } catch (error) {
    stop();
    throw error;
  }
  const audio = context, track = stream.getAudioTracks()[0];
  let reported = false, recovering = false;
  const interrupted = () => { if (!stopped && !reported) { reported = true; onInterrupted(); } };
  track?.addEventListener('ended', interrupted);
  // iOS Safari moves a recording context to "interrupted" or "suspended" when the audio route changes
  // (the microphone switching on, headphones, a notification sound). Most of these pass, so capture is
  // resumed first and only ends when the audio engine does not come back.
  audio.onstatechange = () => {
    if (stopped || recovering || audio.state === 'running') return;
    if (audio.state === 'closed') { interrupted(); return; }
    recovering = true;
    void resumeAudio(audio, AUDIO_RECOVERY_TIMEOUT_MS).then(running => {
      recovering = false;
      if (!running) interrupted();
    });
  };
  // Safari can garbage-collect audio nodes that nothing references, which silently ends capture.
  const graph: AudioNode[] = [];
  let tap: AudioWorkletNode | undefined, flushed: (() => void) | undefined;
  return {
    rate: audio.sampleRate,
    begin(onSamples) {
      return new Promise<void>((resolve, reject) => {
        let first = true;
        const timer = setTimeout(() => { stop(); reject(new Error('The microphone did not start.')); }, 5000);
        // "explicit" mixes every microphone channel into one; the default would keep only the first.
        const node = new AudioWorkletNode(audio, 'xroga-voice-tap', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' });
        tap = node;
        node.port.onmessage = ({ data }: MessageEvent<unknown>) => {
          if (data === 'flushed') { flushed?.(); return; }
          if (stopped || !(data instanceof Float32Array)) return;
          if (first) { first = false; clearTimeout(timer); resolve(); }
          onSamples(data);
        };
        const mute = audio.createGain();
        mute.gain.value = 0;
        const source = audio.createMediaStreamSource(stream);
        graph.push(source, node, mute);
        source.connect(node);
        node.connect(mute);
        mute.connect(audio.destination);
      });
    },
    async finish() {
      if (!stopped && tap && audio.state === 'running') {
        let timer: ReturnType<typeof setTimeout> | undefined;
        await new Promise<void>(resolve => {
          flushed = resolve;
          timer = setTimeout(resolve, AUDIO_FLUSH_TIMEOUT_MS);
          try { tap!.port.postMessage('flush'); } catch { resolve(); }
        });
        clearTimeout(timer);
      }
      stop();
    },
    stop,
  };
}
