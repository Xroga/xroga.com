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

export interface VoiceCapture {
  rate: number;
  /** Starts delivering sample batches. Resolves when the first batch arrives. */
  begin(onSamples: (samples: Float32Array) => void): Promise<void>;
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
    await context.resume();
    await context.audioWorklet.addModule(VOICE_WORKLET_PATH);
    if (signal.aborted) throw new DOMException('Voice typing cancelled.', 'AbortError');
  } catch (error) {
    stop();
    throw error;
  }
  const audio = context, track = stream.getAudioTracks()[0];
  const interrupted = () => { if (!stopped) onInterrupted(); };
  track?.addEventListener('ended', interrupted);
  audio.onstatechange = () => { if (!stopped && audio.state !== 'running') interrupted(); };
  return {
    rate: audio.sampleRate,
    begin(onSamples) {
      return new Promise<void>((resolve, reject) => {
        let first = true;
        const timer = setTimeout(() => { stop(); reject(new Error('The microphone did not start.')); }, 5000);
        const node = new AudioWorkletNode(audio, 'xroga-voice-tap', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
        node.port.onmessage = ({ data }: MessageEvent<unknown>) => {
          if (stopped || !(data instanceof Float32Array)) return;
          if (first) { first = false; clearTimeout(timer); resolve(); }
          onSamples(data);
        };
        const mute = audio.createGain();
        mute.gain.value = 0;
        audio.createMediaStreamSource(stream).connect(node);
        node.connect(mute);
        mute.connect(audio.destination);
      });
    },
    stop,
  };
}
