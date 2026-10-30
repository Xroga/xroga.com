import { VOICE_RUNTIME_PATH, VOICE_SAMPLE_RATE, validateVoiceSamples } from './voiceLocalProtocol';

export type VoiceProgress = (stage: 'loading' | 'transcribing', percent?: number) => void;
const cancelled = () => new DOMException('Voice typing cancelled.', 'AbortError');
const failure = (code: unknown) => Object.assign(new Error('Local voice input did not finish.'), {
  name: code === 'download' ? 'VoiceDownloadError' : code === 'silence' ? 'VoiceSilenceError' : 'VoiceEngineError',
});

/** One context-owned worker. It retains public model weights, never previous audio. */
export function createVoiceEngine(createWorker = () => new Worker(`${VOICE_RUNTIME_PATH}worker.js`, {type:'module'}), deadlineMs = 600000) {
  let worker: Worker | undefined, sequence=0, generation=0, ready=false;
  let preparation: Promise<void> | null=null, idleTimer: ReturnType<typeof setTimeout> | undefined;
  const pending=new Map<number, {type:'prepare'|'transcribe';progress:VoiceProgress;resolve:(value:string)=>void;reject:(error:Error)=>void;cleanup:()=>void}>();
  const clearIdle=()=>{clearTimeout(idleTimer);idleTimer=undefined;};
  const dispose=(error:Error=cancelled())=>{
    clearIdle();generation++;worker?.terminate();worker=undefined;ready=false;preparation=null;
    const requests=[...pending.values()];pending.clear();
    for(const request of requests){request.cleanup();request.reject(error);}
  };
  const getWorker=()=>{
    if(worker)return worker;
    worker=createWorker();
    const workerGeneration=++generation;
    worker.onmessage=({data}:MessageEvent<unknown>)=>{
      if(workerGeneration!==generation)return;
      if(!data || typeof data!=='object')return;
      const reply=data as {id?:number;type?:string;stage?:string;percent?:number;text?:string;code?:unknown};
      if(!Number.isSafeInteger(reply.id))return;
      const request=pending.get(reply.id!);if(!request)return;
      if(reply.type==='progress' && (reply.stage==='loading'||reply.stage==='transcribing')) {
        const percent=typeof reply.percent==='number' && Number.isFinite(reply.percent) && reply.percent>=0 && reply.percent<=100 ? reply.percent : undefined;
        request.progress(reply.stage,percent);return;
      }
      if(reply.type==='error'){dispose(failure(reply.code));return;}
      const valid= request.type==='prepare' ? reply.type==='ready' : reply.type==='complete' && typeof reply.text==='string' && !!reply.text.trim() && reply.text.length<=100000;
      if(!valid){dispose(failure('engine'));return;}
      pending.delete(reply.id!);request.cleanup();request.resolve(reply.text?.trim()??'');
    };
    worker.onerror=()=>{if(workerGeneration===generation)dispose(failure('engine'));};
    worker.onmessageerror=()=>{if(workerGeneration===generation)dispose(failure('engine'));};
    return worker;
  };
  const request=(type:'prepare'|'transcribe',signal:AbortSignal,progress:VoiceProgress,samples?:Float32Array):Promise<string>=>{
    if(signal.aborted)return Promise.reject(cancelled());
    if(pending.size)return Promise.reject(failure('busy'));
    clearIdle();
    return new Promise((resolve,reject)=>{
      const id=++sequence,abort=()=>dispose(cancelled());
      let timer:ReturnType<typeof setTimeout>;
      const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);if(samples?.byteLength)samples.fill(0);};
      pending.set(id,{type,progress,resolve,reject,cleanup});
      signal.addEventListener('abort',abort,{once:true});
      timer=setTimeout(()=>dispose(failure('timeout')),deadlineMs+(samples?samples.length/VOICE_SAMPLE_RATE*6000:0));
      try{getWorker().postMessage({id,type,...(samples?{samples}: {})},samples?[samples.buffer as ArrayBuffer]:[]);}
      catch{dispose(failure('engine'));}
    });
  };
  const prepare=(signal:AbortSignal,progress:VoiceProgress):Promise<void>=>{
    clearIdle();
    if(signal.aborted)return Promise.reject(cancelled());
    if(ready)return Promise.resolve();
    if(preparation)return preparation;
    preparation=request('prepare',signal,progress).then(()=>{ready=true;preparation=null;},error=>{preparation=null;throw error;});
    return preparation;
  };
  return {prepare,dispose,
    async recognize(samples:Float32Array,signal:AbortSignal,progress:VoiceProgress) {
      validateVoiceSamples(samples);
      await prepare(signal,progress);
      if(signal.aborted){samples.fill(0);throw cancelled();}
      return request('transcribe',signal,progress,samples);
    },
    idle(){clearIdle();if(!pending.size)idleTimer=setTimeout(()=>dispose(),120000);},
  };
}

export type VoiceEngine = ReturnType<typeof createVoiceEngine>;
