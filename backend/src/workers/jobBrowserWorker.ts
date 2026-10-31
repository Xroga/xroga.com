import { createHash } from 'node:crypto';
import { parseBrowserJob, type BrowserJob } from './browserJob.js';
import { parseBrowserPlan, type BrowserPlan } from './browserPlan.js';
import { BrowserTaskError, type BrowserWorkerPort, type BrowserWorkerResult } from './browserTaskHandler.js';
import type { LeaseStore, Lease } from './leaseStore.js';
import { containsCredentialSecretText } from '../security/egress/dataClassification.js';

/** Transport only. The canonical handler retains authority, admission, task
 * leases, retries, postconditions, accounting and private Drive writes.
 * A transport must bind start to the durable lease and deduplicate executionId.
 * Neither a successful Cloud Run operation nor an exit code is a task result.
 */
export interface BrowserJobTransport {
  start(input: { executionId:string; job:BrowserJob; plan:BrowserPlan; lease:Lease; signal:AbortSignal }): Promise<void>;
  result(executionId:string, signal:AbortSignal): Promise<{
    executionId:string; fence:number; result:BrowserWorkerResult;
    /** Control-plane measurements, never browser-reported estimates or zero defaults. */
    usage:{browserMs:number;allocatedCpuMillis:number;allocatedMemoryMiBMillis:number};
  }>;
  /** Must handle start accepted but its response lost, and verify termination.
   * Uses a fresh bounded signal, since the execution signal may be cancelled. */
  release(executionId:string, signal:AbortSignal):Promise<{terminated:true}>;
}

export class JobBrowserWorker implements BrowserWorkerPort {
  constructor(private readonly transport:BrowserJobTransport, private readonly leases:LeaseStore) {}

  async run(input:BrowserJob,ctx:Parameters<BrowserWorkerPort['run']>[1]):Promise<BrowserWorkerResult> {
    const job=parseBrowserJob(input),plan=parseBrowserPlan(ctx.plan,job);
    if(job.limits.maxModelCostMicros!==0||plan.writeGrant||plan.steps.some(step=>step.op.startsWith('ai')))
      throw new BrowserTaskError('PERMISSION_REVOKED','This worker path currently admits model-free read-only tasks only.',false);
    if(containsCredentialSecretText(JSON.stringify({job,plan})))
      throw new BrowserTaskError('CREDENTIAL_LIKE_CONTENT','Browser input contains protected credential material.',false);
    if(ctx.lease.tenantId!==job.tenantId||ctx.lease.runId!==job.runId||ctx.lease.taskId!==job.taskId)
      throw new BrowserTaskError('LEASE_LOST','Browser execution lease does not match the task.',false);
    ctx.signal.throwIfAborted();
    await this.leases.assertCurrent(ctx.lease);
    const executionId='browser-'+createHash('sha256').update(JSON.stringify([job.tenantId,job.runId,job.taskId,job.attempt,ctx.lease.token])).digest('hex').slice(0,40);
    let answer:BrowserWorkerResult|undefined;
    let error:unknown;
    try {
      // Once start may have reached the provider, even a lost response requires
      // cleanup by deterministic identity. Never blindly submit a second job.
      await this.transport.start({executionId,job,plan,lease:ctx.lease,signal:ctx.signal});
      const receipt=await this.transport.result(executionId,ctx.signal);
      ctx.signal.throwIfAborted();
      await this.leases.assertCurrent(ctx.lease);
      if(receipt.executionId!==executionId||receipt.fence!==ctx.lease.token)
        throw new BrowserTaskError('LEASE_LOST','Browser result belongs to a different execution.',false);
      if(!receipt.usage||Object.values(receipt.usage).length!==3||
          !['browserMs','allocatedCpuMillis','allocatedMemoryMiBMillis'].every(key=>Number.isSafeInteger(receipt.usage[key as keyof typeof receipt.usage])&&receipt.usage[key as keyof typeof receipt.usage]>=0))
        throw new BrowserTaskError('WORKER_FAILED','Browser resource usage was not verified.',false);
      answer={...receipt.result,metrics:{...receipt.result.metrics,resourceUsage:receipt.usage,executionId}};
    } catch(cause){error=cause??new Error('browser execution failed');}
    try {
      const cleaned=await this.transport.release(executionId,AbortSignal.timeout(30_000));
      if(cleaned?.terminated!==true)throw new Error('termination unverified');
    } catch {
      // Do not report success or automatically retry while an old browser may
      // still be running. The durable task retains a recovery blocker.
      throw new BrowserTaskError('WORKER_FAILED','Browser cleanup could not be verified. Recovery is required before retry.',false);
    }
    if(error){
      if(error instanceof BrowserTaskError)throw error;
      throw new BrowserTaskError(ctx.signal.aborted?'CANCELLED':'WORKER_FAILED',ctx.signal.aborted?'The browser task was cancelled.':'The browser execution did not complete.',false);
    }
    ctx.signal.throwIfAborted();
    await this.leases.assertCurrent(ctx.lease);
    return answer!;
  }
}
