/** Explicit synthetic Cloud Run Job, never part of API startup. No DB, model,
 * customer credential or KMS operation. Does not satisfy full migration acceptance. */
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { GceMachineControl, type GceExecutionHandle } from '../sandbox/google/gceMachineControl.js';
import { GceSshExecutionError, GceSshTransport } from '../sandbox/google/gceSshTransport.js';

const project='project-c40d4821-e647-4fa2-92d';
const account=`xroga-api-runtime@${project}.iam.gserviceaccount.com`;
const nodeImage='node@sha256:25b3eb23a00590b7499f2a2ce939322727fcce1b15fdd69754fcd09536a3ae2c';
const browserImage='mcr.microsoft.com/playwright@sha256:baed2032d533817f3dbe6425de795788430ba345e819a1201337009ba17c9d07';
const receipt: Record<string,unknown>={scope:'SYNTHETIC_NATIVE_GCE_TRANSPORT_ONLY',status:'IN_PROGRESS',
  customerData:false,platformCredentials:false,productionTrafficChanged:false,
  sourceSha:process.env.XROGA_RELEASE_SHA,job:process.env.CLOUD_RUN_JOB,execution:process.env.CLOUD_RUN_EXECUTION};
let control: GceMachineControl | undefined;
let handle: GceExecutionHandle | undefined;
let cleanupPromise: Promise<void> | undefined;
let stopping=false;
const cleanup=(): Promise<void> => !handle ? Promise.resolve() : cleanupPromise ??= (async()=>{
  if(control && handle){await control.destroy(handle);receipt.cleanup='VERIFIED_DELETE_OPERATION_DONE';}
})();
process.once('SIGTERM',()=>{stopping=true;void cleanup().finally(()=>{process.exitCode=1;});});
try {
  receipt.phase='native_identity';
  if(process.env.XROGA_GCE_VERIFY_ONLY!=='synthetic_native_transport' || !process.env.CLOUD_RUN_JOB)
    throw new Error('EXPLICIT_PRIVATE_VERIFICATION_JOB_REQUIRED');
  const identity=await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email',
    {headers:{'Metadata-Flavor':'Google'},signal:AbortSignal.timeout(5000)});
  if(!identity.ok || (await identity.text()).trim()!==account)throw new Error('ATTACHED_RUNTIME_PRINCIPAL_MISMATCH');
  receipt.attachedPrincipal=account;
  control=new GceMachineControl({project,zone:'us-central1-a',
    subnet:`projects/${project}/regions/us-central1/subnetworks/xroga-verify-subnet`,
    imageName:'xroga-exec-base-20261025',imageId:'8312988193178802095',serviceAccount:account,
    admittedImages:[nodeImage,browserImage],maxConcurrentInstances:1});
  receipt.phase='create_worker';
  handle=await control.create({runtimeId:randomUUID(),ownerReference:account,scopeReference:'synthetic-native-transport',
    ttlSeconds:600,memoryMb:512,diskMb:128,maxProcesses:64,cpus:1});
  if(stopping)throw new Error('VERIFICATION_CANCELLED');
  receipt.instance={name:handle.name,id:handle.instanceId,zone:'us-central1-a',hardLifetimeSeconds:600};
  const transport=new GceSshTransport(control);
  receipt.phase='authenticated_worker_probe';
  const probe=await transport.run<{available?: boolean;controlSha256?: string}>(handle,{operation:'probe'},15000);
  const worker=readFileSync(new URL('../../src/sandbox/google/runtime_control.py',import.meta.url));
  if(probe.available!==true || probe.controlSha256!==createHash('sha256').update(worker).digest('hex'))
    throw new Error('IMMUTABLE_WORKER_CONTROL_NOT_VERIFIED');
  receipt.workerSourceVerified=true;
  receipt.phase='foreign_binding_denial';
  let ownerDenied=false;
  try {await transport.run({...handle,ownerBinding:'0'.repeat(40)},{operation:'probe'},5000);}
  catch(error){ownerDenied=error instanceof Error && error.message==='GCE_RUNTIME_IDENTITY_OR_OWNER_MISMATCH';}
  if(!ownerDenied)throw new Error('FOREIGN_RESOURCE_BINDING_NOT_DENIED');
  receipt.foreignBindingDeniedBeforeSsh=true;
  const script=`
const fs=require('node:fs');
(async()=>{
 const denied=async url=>{try{await fetch(url,{signal:AbortSignal.timeout(1500)});return false;}catch{return true;}};
 let readOnly=false;try{fs.writeFileSync('/etc/xroga-must-deny','synthetic');}catch(e){readOnly=['EROFS','EACCES'].includes(e.code);}
 const checks={nonRoot:process.getuid()===65532,readOnly,
 metadataDenied:await denied('http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token'),
 externalNetworkDenied:await denied('https://example.com'),
 noPlatformCredentials:!['SUPABASE_SERVICE_ROLE_KEY','GOOGLE_APPLICATION_CREDENTIALS','OPENROUTER_API_KEY'].some(k=>k in process.env),
 processLimit:fs.readFileSync('/sys/fs/cgroup/pids.max','utf8').trim()==='64',
 memoryLimit:fs.readFileSync('/sys/fs/cgroup/memory.max','utf8').trim()==='536870912'};
 console.log(JSON.stringify(checks));if(!Object.values(checks).every(Boolean))process.exitCode=1;
})().catch(()=>{process.exitCode=1;});`;
  receipt.phase='isolated_node_execution';
  const result=await transport.run<{exitCode?: number;stdout?: string;timedOut?: boolean;killedForLimit?: boolean}>(handle,
    {operation:'exec',image:nodeImage,command:['node','-e',script],environment:{SYNTHETIC_EXECUTION:'1'},
      timeoutMs:15000,networkPolicy:'none'},15000);
  if(result.exitCode!==0 || result.timedOut || result.killedForLimit || typeof result.stdout!=='string')
    throw new Error('NATIVE_SANDBOX_EXECUTION_NOT_VERIFIED');
  const checks=JSON.parse(result.stdout) as Record<string,unknown>;
  if(Object.keys(checks).length!==7 || !Object.values(checks).every(value=>value===true))
    throw new Error('NATIVE_SANDBOX_NEGATIVE_CHECK_FAILED');
  receipt.execution=checks;
  receipt.phase='complete';
  receipt.status='PASS_SYNTHETIC_NATIVE_IDENTITY_OS_LOGIN_AND_ISOLATED_EXECUTION';
} catch(error) {
  receipt.status='BLOCKED_NATIVE_GCE_TRANSPORT';
  if(error instanceof GceSshExecutionError)receipt.sshFailure={category:error.failureCategory,exitCode:error.exitCode};
  receipt.reason=error instanceof Error && /^[A-Z_]+$/.test(error.message)?error.message:'VERIFICATION_OPERATION_FAILED';
  process.exitCode=1;
} finally {
  try {await cleanup();} catch {receipt.cleanup='PENDING_NATIVE_DELETE_WITH_TEN_MINUTE_PHYSICAL_DEADLINE';process.exitCode=1;}
  receipt.at=new Date().toISOString();
  console.log(JSON.stringify({xrogaGceTransportReceipt:receipt}));
}
