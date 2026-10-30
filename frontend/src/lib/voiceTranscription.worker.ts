import { env, pipeline, Tensor, TextStreamer, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import { VOICE_MODEL, VOICE_MODEL_REVISION, VOICE_RUNTIME_PATH, validateVoiceSamples, selectVoiceLanguage, voiceCompletionGuard, voiceSegments, type VoiceWorkerReply } from './voiceLocalProtocol';
import { isVoiceDownloadFailure, loadVoiceModel } from './voiceModelLoading';

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
let busy = false;
let prepared: Promise<AutomaticSpeechRecognitionPipeline> | null = null;
const reply = (value: VoiceWorkerReply, id?: number) => postMessage(id === undefined ? value : {...value,id});
onmessage = async (event: MessageEvent<unknown>) => {
  const framed=event.data && typeof event.data==='object' && !(event.data instanceof Float32Array) ? event.data as {id?:number;type?:string;samples?:unknown} : null;
  const id=framed?.id;
  if(framed && (!Number.isSafeInteger(id) || id!<=0 || !['prepare','transcribe'].includes(framed.type??'')))return;
  if(busy){reply({type:'error',code:'engine'},id);return;}
  busy = true;
  let samples: Float32Array | undefined, loading=false;
  const prepare=()=>{
    loading=true;
    reply({type:'progress',stage:'loading'},id);
    if(!prepared) {
      const files=new Map<string,{loaded:number;total:number}>();
      prepared=loadVoiceModel(()=>pipeline('automatic-speech-recognition',VOICE_MODEL,{
        revision:VOICE_MODEL_REVISION,device:'wasm',dtype:'q8',
        progress_callback:(event:unknown)=>{
          if(!event || typeof event!=='object')return;
          const update=event as {status?:string;file?:string;loaded?:number;total?:number};
          if(update.status!=='progress'||!update.file?.endsWith('.onnx')||!Number.isFinite(update.loaded)||!Number.isFinite(update.total)||update.total!<=0)return;
          files.set(update.file,{loaded:Math.max(0,update.loaded!),total:update.total!});
          const all=[...files.values()],loaded=all.reduce((sum,file)=>sum+file.loaded,0),total=all.reduce((sum,file)=>sum+file.total,0);
          reply({type:'progress',stage:'loading',percent:Math.min(99,Math.round(100*loaded/total))},id);
        },
      }),()=>{files.clear();reply({type:'progress',stage:'loading'},id);}).catch(error=>{prepared=null;throw error;});
    }
    return prepared;
  };
  try {
    if(framed?.type==='prepare'){await prepare();reply({type:'ready'},id);return;}
    const input=framed?framed.samples:event.data;
    validateVoiceSamples(input);
    samples = input;
    // Silence is not a prompt. Avoid publishing Whisper's hallucinations on empty input.
    const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    if (rms < 0.0005) {reply({type:'error',code:'silence'},id);return;}
    const transcriber = await prepare();
    loading=false;
    try {
      reply({ type: 'progress', stage: 'transcribing' },id);
      // Transformers.js 3 defaults to English when language is omitted. Use Whisper's
      // own first-token language scores instead, as in openai/whisper detect_language.
      const config = transcriber.model.generation_config;
      const languageTokens = config && 'lang_to_id' in config ? config.lang_to_id : null;
      if (!config || !Number.isSafeInteger(config.decoder_start_token_id) || !languageTokens
        || typeof languageTokens !== 'object' || Array.isArray(languageTokens)
        || Object.values(languageTokens).some(id => typeof id !== 'number')) throw new Error('Missing language metadata');
      const transcripts: string[] = [];
      for (const [start, end] of voiceSegments(samples)) {
        const segment = samples.subarray(start, end);
        if (Math.sqrt(segment.reduce((sum, value) => sum + value * value, 0) / segment.length) < 0.0005) continue;
        const features = await transcriber.processor(segment);
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
        // Each contiguous audio range is decoded once. Do not deduplicate repeated speech.
        const streamer = new TextStreamer(transcriber.tokenizer, { callback_function: () => {} });
        // Observe completion tokens only. Never print or stream private transcript text.
        Object.assign(streamer, voiceCompletionGuard(config.eos_token_id!));
        const result = await transcriber(segment, { language, task: 'transcribe', chunk_length_s: 0,
          streamer });
        const text = !Array.isArray(result) && typeof result.text === 'string' ? result.text.trim() : '';
        if (!text || text.length > 100000) throw new Error('No usable transcript');
        transcripts.push(text);
      }
      const text = transcripts.join(' ');
      if (!text || text.length > 100000) throw new Error('No usable transcript');
      reply({ type: 'complete', text },id);
    } finally {
      samples.fill(0);
      // Legacy one-shot helpers dispose immediately. A context-owned engine
      // retains only the public model and is terminated on cancel/idle/unmount.
      if(!framed){await transcriber.dispose();prepared=null;}
    }
  } catch(error) { reply({ type: 'error',code:loading && isVoiceDownloadFailure(error)?'download':'engine' },id); }
  finally {samples?.fill(0);busy=false;}
};
