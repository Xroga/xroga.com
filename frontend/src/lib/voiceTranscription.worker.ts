import { env, pipeline, Tensor, TextStreamer } from '@huggingface/transformers';
import { VOICE_MODEL, VOICE_MODEL_REVISION, VOICE_RUNTIME_PATH, validateVoiceSamples, selectVoiceLanguage, voiceCompletionGuard, type VoiceWorkerReply } from './voiceLocalProtocol';

// The upstream model runner logs input tensors on failure. This dedicated worker
// reports only the bounded error message below, never private audio features.
console.error = () => {};
console.warn = () => {};
// Self-host executable code. Download only pinned public model data from the Hub.
env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm!.wasmPaths = VOICE_RUNTIME_PATH;
env.backends.onnx.wasm!.numThreads = 1;
env.backends.onnx.wasm!.proxy = false;
let started = false;
const reply = (value: VoiceWorkerReply) => postMessage(value);
onmessage = async (event: MessageEvent<unknown>) => {
  if (started) return;
  started = true;
  try {
    validateVoiceSamples(event.data);
    const samples = event.data;
    // Silence is not a prompt. Avoid publishing Whisper's hallucinations on empty input.
    const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    if (rms < 0.0005) throw new Error('No audible input');
    reply({ type: 'progress', stage: 'loading' });
    const transcriber = await pipeline('automatic-speech-recognition', VOICE_MODEL, {
      revision: VOICE_MODEL_REVISION, device: 'wasm', dtype: 'q8',
    });
    try {
      reply({ type: 'progress', stage: 'transcribing' });
      // Transformers.js 3 defaults to English when language is omitted. Use Whisper's
      // own first-token language scores instead, as in openai/whisper detect_language.
      const config = transcriber.model.generation_config;
      const languageTokens = config && 'lang_to_id' in config ? config.lang_to_id : null;
      if (!config || !Number.isSafeInteger(config.decoder_start_token_id) || !languageTokens
        || typeof languageTokens !== 'object' || Array.isArray(languageTokens)
        || Object.values(languageTokens).some(id => typeof id !== 'number')) throw new Error('Missing language metadata');
      const features = await transcriber.processor(samples.subarray(0, 30 * 16000));
      const prompt = new Tensor('int64', BigInt64Array.of(BigInt(config.decoder_start_token_id)), [1, 1]);
      let detection: Record<string, unknown> | undefined;
      let language: string;
      const dispose = (value: unknown): void => {
        if (value instanceof Tensor) value.dispose();
        else if (Array.isArray(value)) value.forEach(dispose);
        else if (value && typeof value === 'object') Object.values(value).forEach(dispose);
      };
      try {
        detection = await transcriber.model({ input_features: features.input_features, decoder_input_ids: prompt });
        const logits = detection!.logits;
        if (!(logits instanceof Tensor) || logits.dims[0] !== 1 || logits.dims[1] !== 1) throw new Error('Invalid language detection');
        language = selectVoiceLanguage(logits.data as Float32Array, languageTokens as Record<string, number>);
      } finally { dispose(detection); dispose(features); prompt.dispose(); }
      // No translation. Overlap is handled by Whisper's chunk merger.
      const streamer = new TextStreamer(transcriber.tokenizer, { callback_function: () => {} });
      // Observe completion tokens only. Never print or stream private transcript text.
      Object.assign(streamer, voiceCompletionGuard(config.eos_token_id!));
      const result = await transcriber(samples, { language, task: 'transcribe', chunk_length_s: 25, stride_length_s: 5,
        streamer });
      const text = !Array.isArray(result) && typeof result.text === 'string' ? result.text.trim() : '';
      if (!text || text.length > 100000) throw new Error('No usable transcript');
      reply({ type: 'complete', text });
    } finally { samples.fill(0); await transcriber.dispose(); }
  } catch { reply({ type: 'error' }); }
};
