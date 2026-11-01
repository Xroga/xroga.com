import { isTerminalModelFailure } from '../ai/providerRuntime.js';
import type { BrowserJob } from './browserJob.js';
import type { BrowserModelGateway, ModelUsage } from './containerBrowserWorker.js';
import { BrowserTaskError } from './browserTaskHandler.js';

/** One worker stream's existing model allowance and cancellation lifetime.
 * This is not a ledger or a reservation issuer. The gateway still owns durable
 * admission and settlement. An untrusted worker cannot overlap, replay, or
 * finish around that admission, and its reported spend is never authoritative.
 */
export class BrowserModelLifetime {
  private readonly abort = new AbortController();
  private pending = false;
  private lastId = 0;
  private failure: BrowserTaskError | undefined;
  private readonly onAbort = () => this.abort.abort();
  constructor(private readonly job: BrowserJob, private readonly gateway: BrowserModelGateway | undefined,
    private readonly parent: AbortSignal, readonly usage: ModelUsage) {
    if(parent.aborted)this.abort.abort();
    else parent.addEventListener('abort',this.onAbort,{once:true});
  }
  private deny(reason:string):never {
    this.failure = new BrowserTaskError('WORKER_FAILED',reason,false);
    this.abort.abort();
    throw this.failure;
  }
  assertComplete():void {
    if(this.failure)throw this.failure;
    if(this.pending)this.deny('the browser returned before model accounting completed');
    if(this.abort.signal.aborted)throw new BrowserTaskError('CANCELLED','the job was stopped');
  }
  request(id:unknown,params:unknown):ReturnType<BrowserModelGateway['generate']> {
    if(this.failure)throw this.failure;
    if(this.abort.signal.aborted)throw new BrowserTaskError('CANCELLED','the job was stopped');
    if(!Number.isSafeInteger(id)||Number(id)<=this.lastId||Number(id)>1024||this.pending)
      this.deny('the browser model request was replayed, overlapping or invalid');
    this.lastId=Number(id);
    if(!this.gateway)this.deny('no model route is configured');
    const remaining=this.job.limits.maxModelCostMicros-this.usage.costMicros;
    if(remaining<=0)this.deny('the job model budget is spent');
    this.pending=true;
    return (async()=>{
      try{
        const result=await this.gateway!.generate(params,{job:this.job,remainingMicros:remaining,signal:this.abort.signal});
        if(![result.inputTokens,result.outputTokens,result.costMicros].every(n=>Number.isSafeInteger(n)&&n>=0)||result.costMicros>remaining)
          this.deny('the model result has invalid or excessive accounting');
        // Record already settled usage even when cancellation prevents delivery.
        this.usage.calls++;this.usage.inputTokens+=result.inputTokens;this.usage.outputTokens+=result.outputTokens;this.usage.costMicros+=result.costMicros;
        if(this.failure)throw this.failure;
        if(this.abort.signal.aborted)throw new BrowserTaskError('CANCELLED','the job was stopped');
        return result;
      }catch(error){
        this.usage.refused++;
        const code=(error as {code?:string})?.code;
        const status=(error as {status?:number})?.status;
        const providerFailure=code==='MODEL_FAILED'||[429,500,502,503,504].includes(status??0);
        if(isTerminalModelFailure(error)||!providerFailure)this.deny('the model request was denied or could not be accounted for');
        throw error;
      }finally{this.pending=false;}
    })();
  }
  close():void {
    this.parent.removeEventListener('abort',this.onAbort);
    this.abort.abort();
  }
}
