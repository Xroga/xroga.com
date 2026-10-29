import type {Request,Response} from 'express';
import {requireTenantContext,type TenantContext} from '../security/tenantContext.js';
import {GoogleDeliveryStore,type CanonicalQueuedInput} from './googleDeliveryStore.js';
import {GoogleCanonicalDispatch,googleDispatchConfiguration} from './googleDispatch.js';
import {getRunAsync} from '../ai/runStore.js';
import {initSSE,sendSSE,endSSE} from '../lib/sse.js';
import {bindBuildStreamDisconnect} from '../lib/buildStreamLifecycle.js';
import {publicAiPayload} from '../lib/publicAiIdentity.js';
import {slimOutputForSse} from '../lib/slimOutputForSse.js';
import {assertHasQuota} from '../ai/quota.js';

export function googleBackgroundSelected(env:Readonly<NodeJS.ProcessEnv>=process.env):boolean{
  const value=env.XROGA_BACKGROUND_EXECUTION_PROVIDER;
  if(value&&value!=='google-jobs')throw new Error('BACKGROUND_PROVIDER_INVALID');
  return value==='google-jobs';
}

/** HTTP is an observer of the durable worker, never its execution owner. A
 * disconnect/restart stops this relay without cancelling or replaying work. */
interface QueueDependencies {
  store:Pick<GoogleDeliveryStore,'enqueue'|'loadResult'>;
  transport:Pick<GoogleCanonicalDispatch,'enqueue'>;
  read:typeof getRunAsync;
  quota:(context:TenantContext)=>Promise<unknown>;
  pollMs?:number;
}
/** Admission without an HTTP response: quota, durable enqueue and dispatch. A failed dispatch is retried by the named outbox sweep. */
export async function admitGoogleRun(context:TenantContext,runId:string,input:CanonicalQueuedInput,fixtures?:Pick<QueueDependencies,'store'|'transport'|'quota'>):Promise<{runId:string;dispatched:boolean}>{
  requireTenantContext(context);
  const dependencies=fixtures??(()=>{const c=googleDispatchConfiguration();return{store:new GoogleDeliveryStore(c),transport:new GoogleCanonicalDispatch(c),
    quota:(actor:TenantContext)=>assertHasQuota(requireTenantContext(actor).userId)};})();
  await dependencies.quota(context);
  const deliveryId=await dependencies.store.enqueue(context,runId,input);
  let dispatched=false;
  try{await dependencies.transport.enqueue(deliveryId);dispatched=true;}catch{/* the outbox sweep retries delivery only */}
  return{runId,dispatched};
}

export async function enqueueGoogleSwarm(req:Request,res:Response,context:TenantContext,runId:string,input:CanonicalQueuedInput,stream:boolean,fixtures?:QueueDependencies){
  requireTenantContext(context);
  const dependencies:QueueDependencies=fixtures??(()=>{const c=googleDispatchConfiguration();return{store:new GoogleDeliveryStore(c),transport:new GoogleCanonicalDispatch(c),read:getRunAsync,
    quota:(actor:TenantContext)=>assertHasQuota(requireTenantContext(actor).userId)};})();
  const {store,transport,read}=dependencies;
  await dependencies.quota(context);
  const deliveryId=await store.enqueue(context,runId,input);
  let dispatched=false;
  try{await transport.enqueue(deliveryId);dispatched=true;}catch{
    // The named Cloud Scheduler outbox sweep retries delivery only. It never
    // reopens a failed run or repeats an unknown consequential action.
  }
  if(!stream)return res.status(202).json({runId,status:'running',queued:true,dispatchPending:!dispatched});
  initSSE(res);let connected=true;let sequence=0;
  const detach=bindBuildStreamDisconnect(req,res,()=>{connected=false;});
  sendSSE(res,{event:'start',data:{runId,message:'Xroga accepted the durable execution request.'}});
  sendSSE(res,{event:'progress',data:{runId,stage:'queued',message:dispatched?'Waiting for bounded worker capacity.':'Request is saved. Worker dispatch is pending.'}});
  const deadline=Date.now()+54*60*1000;
  try{
    while(connected&&!res.writableEnded&&Date.now()<deadline){
      // A hot API cache is not authoritative for a different Job process.
      const run=await read(runId,context.userId,true);
      if(!connected||res.destroyed||res.writableEnded)return;
      if(!run)throw new Error('Durable run is unavailable.');
      for(const event of run.events.filter(event=>event.sequence>sequence)){
        sequence=Math.max(sequence,event.sequence);
        if(typeof event.data.__transportDelta==='string')sendSSE(res,{event:'delta',data:publicAiPayload({delta:event.data.__transportDelta})});
        else sendSSE(res,{event:'progress',data:publicAiPayload({...event.data,sequence:event.sequence})});
      }
      if(run.status!=='running'){
        const result=run.status==='complete'?await store.loadResult(context,runId):null;
        if(run.status==='complete'&&!result){await new Promise(resolve=>setTimeout(resolve,dependencies.pollMs??2000));continue;}
        if(run.status==='complete')sendSSE(res,{event:'complete',data:publicAiPayload({runId,success:result!.success,featureCategory:run.featureCategory,
          output:slimOutputForSse(run.output??{}),tokenUsage:run.tokenUsage,followUps:result!.followUps})});
        else sendSSE(res,{event:'error',data:publicAiPayload({runId,code:run.status==='cancelled'?'BUILD_CANCELLED':'BUILD_FAILED',
          error:typeof run.output?.error==='string'?run.output.error:'The worker stopped. Durable evidence is available for recovery.'})});
        return endSSE(res);
      }
      sendSSE(res,{event:'progress',data:{keepalive:true,runId,message:'Working…'}});
      await new Promise(resolve=>setTimeout(resolve,dependencies.pollMs??2000));
    }
    if(connected&&!res.writableEnded){
      sendSSE(res,{event:'error',data:{runId,code:'STREAM_RECONNECT_REQUIRED',error:'Reconnect to the saved run for its latest status.'}});endSSE(res);
    }
  }catch{
    if(connected&&!res.writableEnded){sendSSE(res,{event:'error',data:{runId,code:'RUN_STATUS_UNAVAILABLE',error:'The saved run status is temporarily unavailable. Reconnect to recover it.'}});endSSE(res);}
  }finally{detach();}
}
