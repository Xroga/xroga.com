// Reproducible first-party Job entrypoint. No HTTP server, assistant CLI,
// personal identity, second task graph or automatic provider retry loop.
import '../runtime/installSafeLogging.js';
import '../loadPlatformEnvironment.js';
import {GoogleDeliveryStore,requireCanonicalDeliveryClaim} from '../workers/googleDeliveryStore.js';
import {googleDispatchConfiguration} from '../workers/googleDispatch.js';
import {initializeCredentialVaultForServer} from '../services/integrations/credentialVaultStartup.js';
import {runBuildPipeline} from '../ai/pipeline.js';
import {withRunAttempt,currentRunWorkerId,appendRunEvent,isRunCancellationRequested,
  failRun,persistTerminalRunAuthority,hasAdmittedRunAttempt} from '../ai/runStore.js';
import {failInFlightRuns} from '../ai/runReconciler.js';
import {notifyBuildComplete,notifyBuildFailed} from '../services/notificationService.js';
import {openBuilderRun,closeBuilderRun} from '../builder/swarmBridge.js';
import type {BuilderRunBinding} from '../builder/service.js';

const controller=new AbortController();let runId:string|undefined;let ownerId:string|undefined;
let cancellationCheck:ReturnType<typeof setInterval>|undefined;let checking=false;
const stop=()=>{controller.abort();if(runId)void failInFlightRuns([runId],'deploy_interrupted',{workerId:currentRunWorkerId()}).catch(()=>{});};
process.once('SIGTERM',stop);process.once('SIGINT',stop);
const deadline=setTimeout(stop,55*60*1000);deadline.unref();
try{
  const config=googleDispatchConfiguration();
  if(process.env.NODE_ENV!=='production'||process.env.XROGA_RUNTIME_ROLE!=='canonical-worker'
    ||process.env.XROGA_PROJECT_RUNTIME_PROVIDER!=='google-gce'||process.env.XROGA_BACKGROUND_EXECUTION_PROVIDER!=='google-jobs'
    ||process.env.XROGA_CREDENTIAL_KMS_PROVIDER!=='google_cloud'||process.env.XROGA_GOOGLE_CLOUD_AUTH_MODE!=='metadata_adc'){
    throw new Error('NATIVE_MANAGED_CANONICAL_WORKER_REQUIRED');
  }
  if(process.argv.length!==3)throw new Error('CANONICAL_DELIVERY_REQUIRED');
  await initializeCredentialVaultForServer();
  await withRunAttempt(async()=>{
    const deliveryStore=new GoogleDeliveryStore(config);
    const claim=await deliveryStore.claim(process.argv[2]!,currentRunWorkerId());
    if(!claim)return; // Duplicate, cancelled or already-claimed delivery.
    runId=claim.runId;ownerId=claim.userId;
    const {input,context}=requireCanonicalDeliveryClaim(claim);
    cancellationCheck=setInterval(()=>{
      if(checking||controller.signal.aborted||!hasAdmittedRunAttempt(claim.runId))return;checking=true;
      void isRunCancellationRequested(claim.runId,claim.userId,{requireRunning:true}).then(cancelled=>{if(cancelled)controller.abort();},()=>controller.abort())
        .finally(()=>{checking=false;});
    },1500);cancellationCheck.unref();
    // AI Product Builder: a chat build into a durable project saves its revision through the run binding. The id in the queued input is
    // never trusted on its own; opening the run re-verifies the project against the persisted owner and takes its single run slot.
    let builderRun:BuilderRunBinding|null=null;
    const {builderProjectId,...pipelineInput}=input;
    try{
      builderRun=builderProjectId?await openBuilderRun(context,builderProjectId,claim.runId):null;
      const result=await runBuildPipeline({...pipelineInput,...(builderRun?{builder:builderRun}:{}),runId:claim.runId,userId:claim.userId,tenantContext:context,deliveryClaim:claim,
        signal:controller.signal,onProgress:event=>{appendRunEvent(claim.runId,'progress',event as Record<string,unknown>);},
        onDelta:delta=>{appendRunEvent(claim.runId,'progress',{__transportDelta:delta});}});
      if(builderRun)await closeBuilderRun(context,builderRun,{ok:result.success});
      const output=result.output as Record<string,unknown>;
      const status=await persistTerminalRunAuthority(claim.runId,claim.userId);
      if(status==='complete')await deliveryStore.recordResult(claim,result.success,result.followUps);
      const assistantMessageId=input.clientMeta?.assistantMessageId;
      if(status==='cancelled'||controller.signal.aborted)throw new Error('CANONICAL_WORKER_STOPPED');
      if(output?.type==='landing_page'&&typeof assistantMessageId==='string'){
        if(status==='complete'&&result.success&&(output.fullyShipped===true||output.handoffReady===true)){
          await notifyBuildComplete(context,{projectName:String(output.projectName??'Xroga project'),prompt:input.prompt,
            assistantMessageId,githubRepoUrl:typeof output.githubRepoUrl==='string'?output.githubRepoUrl:undefined,
            githubPushConfirmed:output.githubPushConfirmed===true,fullyShipped:output.fullyShipped===true,handoffReady:output.handoffReady===true,
            deployUrl:typeof output.deployUrl==='string'?output.deployUrl:undefined,deployVerified:output.deployVerified===true,
            fileCount:Array.isArray(output.generatedFiles)?output.generatedFiles.length:undefined}).catch(()=>{});
        }else await notifyBuildFailed(context,{projectName:String(output.projectName??'Xroga project'),prompt:input.prompt,
          error:'Build finished without verified handoff evidence.',assistantMessageId}).catch(()=>{});
      }
      console.log(JSON.stringify({scope:'CANONICAL_GOOGLE_JOB',runId:claim.runId,status,sourceSha:config.sourceSha}));
    }catch(error){
      const code=(error as {code?:string})?.code;
      if(builderRun)await closeBuilderRun(context,builderRun,{ok:false,cancelled:code==='BUILD_CANCELLED'||controller.signal.aborted,
        blocked:code==='BUILDER_ENGINE_DISABLED',reason:error instanceof Error?error.message:'The build stopped.'});
      if(hasAdmittedRunAttempt(claim.runId)){
        failRun(claim.runId,'The build worker stopped. Durable checkpoints are retained. Check connected providers before retrying.','error',{code:'BUILD_INTERRUPTED'});
        await persistTerminalRunAuthority(claim.runId,claim.userId);
      }
      throw error;
    }
  });
}catch{
  // Neither raw provider errors nor durable input belongs in the Job log.
  console.error(JSON.stringify({scope:'CANONICAL_GOOGLE_JOB',status:'FAILED',runId}));process.exitCode=1;
}finally{
  clearTimeout(deadline);if(cancellationCheck)clearInterval(cancellationCheck);
  process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);
  if(runId&&ownerId&&controller.signal.aborted)await failInFlightRuns([runId],'worker_lost',{workerId:currentRunWorkerId()}).catch(()=>{});
}
