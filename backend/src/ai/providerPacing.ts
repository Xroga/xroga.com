import {createHash,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {getSupabaseAdmin} from '../config/supabase.js';

export interface PacingBinding {userId:string;reservationId:string}
export interface PacingReceipt {granted:boolean;retry_after_ms:number}
export interface PacingStore {
  claim(binding:PacingBinding,key:string,token:string):Promise<PacingReceipt>;
  release(key:string,token:string,cooldownSeconds:number):Promise<void>;
}
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const unavailable=()=>Object.assign(Error('Model request capacity is temporarily busy. No provider retry was made.'),
  {code:'MODEL_PROVIDER_BUSY',status:429,retryable:false});

export const durablePacingStore:PacingStore={
  async claim(binding,key,token){
    const {data,error}=await getSupabaseAdmin().rpc('claim_xroga_model_request',{
      p_user_id:binding.userId,p_reservation_id:binding.reservationId,p_key:key,p_token:token});
    if(error||!data||Array.isArray(data)||typeof data.granted!=='boolean'
      ||!Number.isInteger(data.retry_after_ms)||data.retry_after_ms<0||data.retry_after_ms>210_000)throw unavailable();
    return data;
  },
  async release(key,token,cooldownSeconds){
    const {error}=await getSupabaseAdmin().rpc('release_xroga_model_request',{p_key:key,p_token:token,p_cooldown_seconds:cooldownSeconds});
    if(error)throw unavailable();
  },
};

/** Admission polling is not an inference retry. The shared database clock owns
 * spacing/concurrency, and the existing ledger owns every spend reservation. */
export async function acquireModelRequestLease(input:{binding:PacingBinding;credential:string;signal?:AbortSignal;
  store?:PacingStore;maximumWaitMs?:number;now?:()=>number;wait?:(ms:number,signal?:AbortSignal)=>Promise<void>}){
  if(!uuid.test(input.binding.userId)||!uuid.test(input.binding.reservationId)||!input.credential)throw unavailable();
  const store=input.store??durablePacingStore,now=input.now??Date.now;
  const maximumWaitMs=input.maximumWaitMs??90_000;
  if(!Number.isInteger(maximumWaitMs)||maximumWaitMs<0||maximumWaitMs>90_000)throw unavailable();
  const end=now()+maximumWaitMs,token=randomUUID();
  // No credential or reversible encoding leaves this process or enters logs.
  const key=createHash('sha256').update('zurelay-key-v1\0').update(input.credential).digest('hex');
  const wait=input.wait??(async(ms:number,signal?:AbortSignal)=>{await delay(ms,undefined,{signal});});
  for(;;){
    input.signal?.throwIfAborted();
    const receipt=await store.claim(input.binding,key,token);
    if(receipt.granted){
      let released=false;
      return {async release(cooldownSeconds=0){
        if(released)return;released=true;
        await store.release(key,token,Math.min(300,Math.max(0,Math.ceil(cooldownSeconds))));
      }};
    }
    const remaining=end-now();
    if(remaining<=0||receipt.retry_after_ms>remaining)throw unavailable();
    await wait(Math.min(1_000,Math.max(1,receipt.retry_after_ms),remaining),input.signal);
  }
}

export function providerCooldownSeconds(value:string|null,now=Date.now()):number{
  const seconds=value&&/^\d+(?:\.\d+)?$/.test(value)?Number(value):value?(Date.parse(value)-now)/1000:60;
  return Math.min(300,Math.max(1,Number.isFinite(seconds)?Math.ceil(seconds):60));
}

/** Hold the key's concurrency slot until the HTTP body finishes or is cancelled,
 * rather than releasing at response headers while streaming still runs. */
export function releasePacingWithBody(response:Response,release:()=>Promise<void>):Response{
  if(!response.body){void release();return response;}
  const reader=response.body.getReader();
  const body=new ReadableStream<Uint8Array>({
    async pull(controller){
      try{const item=await reader.read();if(item.done){await release();controller.close();}else controller.enqueue(item.value);}
      catch(error){await release();controller.error(error);}
    },
    async cancel(reason){try{await reader.cancel(reason);}finally{await release();}},
  });
  return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
}
