// Approved operator fixture, never imported by Xroga application routes.
// Exact release code, native Google identity, existing synthetic project only.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
const bootEnvironment={...process.env};
await import('file:///app/dist/runtime/installSafeLogging.js');
await import('file:///app/dist/loadPlatformEnvironment.js');
assert.equal(process.env.XROGA_RELEASE_SHA,'85f83e3f1dcbb057d4a28d8a696dae8396d45114');
assert.equal(process.env.CLOUD_RUN_JOB,'xroga-canonical-production');
assert.equal(process.env.SUPABASE_URL.replace(/\/$/,''),'https://nzenxdfumxrnsmybazmo.supabase.co');
const {getSupabaseAdmin}=await import('file:///app/dist/config/supabase.js');
const {createTenantContext}=await import('file:///app/dist/security/tenantContext.js');
const {initializeCredentialVaultForServer}=await import('file:///app/dist/services/integrations/credentialVaultStartup.js');
const {GoogleDeliveryStore,requireCanonicalDeliveryClaim}=await import('file:///app/dist/workers/googleDeliveryStore.js');
const {googleDispatchConfiguration,GoogleCanonicalDispatch}=await import('file:///app/dist/workers/googleDispatch.js');
const runs=await import('file:///app/dist/ai/runStore.js');
const {failInFlightRuns}=await import('file:///app/dist/ai/runReconciler.js');
const {SupabaseProjectRuntimeStore,createProjectRuntimeManager}=await import('file:///app/dist/synthesis/projectRuntime/index.js');
const {startOrRefreshLivePreview}=await import('file:///app/dist/synthesis/livePreview/coordinator.js');
const {revokeLivePreviewGrants}=await import('file:///app/dist/synthesis/livePreview/store.js');
const checkpoints=await import('file:///app/dist/ai/softwareAgent/softwareAgentCheckpoint.js');
const db=getSupabaseAdmin();
const selected=await db.from('projects').select('id,user_id,name').eq('name','Google migration acceptance 20261027 synthetic only');
assert.equal(selected.error,null);assert.equal(selected.data.length,1);
const project=selected.data[0],context=createTenantContext({userId:project.user_id,via:'persisted_owner'});
let lastCheck='START';
const emit=(check,detail={})=>{lastCheck=check;console.log(JSON.stringify({kind:'batch1-source85-production-fixture',fixtureOnly:true,modelCalls:0,check,atUtc:new Date().toISOString(),projectId:project.id,...detail}));};
const deliveries=new GoogleDeliveryStore(googleDispatchConfiguration());
const SUPABASE_CA="-----BEGIN CERTIFICATE-----\nMIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL\nBQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l\ndyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh\nc2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow\nazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD\nYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2Ug\nUm9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXW\nQyHOB+qR2GJobCq/CBmQ40G0oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1Q\nDmGHBH1zDfgs2qXiLb6xpw/CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2\nGtvHxNjUV6kjOZjEn2yWEcBdpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi\ncvTlHmMw6xSQQn1UfRQHk50DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4\nO4XajoVj/+R4GwywKYrrS8PrSNtwxr5StlQO8zIQUSMiq26wM8mgELFlS/32Uclt\nNaQ1xBRizkzpZct9DwIDAQABo2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjX\nuXY32CztkhImng4yJNUtaUYsMB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUt\naUYsMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VU\ntVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b\nVW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6\njB81TU/RG2rVerPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx\nCea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2\nCMTyZKG3XEu5Ghl1LEnI3QmEKsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5P\no/bKiIz+Fq8=\n-----END CERTIFICATE-----\n";
// Atomic fixture admission prevents the ordinary maintenance sweep from
// dispatching a deterministic fixture to an LLM worker between two RPCs.
// It calls the same reviewed production functions under service_role.
async function admitReserved(runId,input){
 const {requireTenantContext}=await import('file:///app/dist/security/tenantContext.js');
 assert.equal(requireTenantContext(context).userId,project.user_id);
 const require=createRequire('file:///app/package.json'),{Client}=require('pg');
 const u=new URL(process.env.DATABASE_URL);if(u.port==='6543')u.port='5432';
 for(const n of ['ssl','sslmode','sslcert','sslkey','sslrootcert'])u.searchParams.delete(n);
 const client=new Client({connectionString:u.href,ssl:{ca:SUPABASE_CA,rejectUnauthorized:true},connectionTimeoutMillis:15000,statement_timeout:15000});
 await client.connect();
 try{
  await client.query('BEGIN');await client.query('SET LOCAL ROLE service_role');
  const deliveryId=randomUUID();
  const enq=await client.query('SELECT public.enqueue_google_canonical_run($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::jsonb,$6::text) AS receipt',[deliveryId,runId,project.user_id,project.id,JSON.stringify(input),process.env.XROGA_RELEASE_SHA]);
  assert.equal(enq.rows[0].receipt.userId,project.user_id);assert.equal(enq.rows[0].receipt.runId,runId);
  const reserved=await client.query('SELECT public.reserve_google_canonical_launch($1::uuid,$2::text,$3::uuid) AS receipt',[enq.rows[0].receipt.deliveryId,process.env.XROGA_RELEASE_SHA,randomUUID()]);
  assert.equal(reserved.rows[0].receipt.state,'reserved');
  await client.query('COMMIT');return enq.rows[0].receipt.deliveryId;
 }catch(e){await client.query('ROLLBACK');throw e;}finally{await client.end();}
}

const store=new SupabaseProjectRuntimeStore();
const runtime=createProjectRuntimeManager(project.user_id,context);
const ownedRuns=[];
let sessionId=null,child=null,openSocket=null;
const server=String.raw`const http=require('node:http'),crypto=require('node:crypto');
const s=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});r.end('<!doctype html><h1>Xroga Batch 1 offline Preview fixture</h1>');});
s.on('upgrade',(q,c)=>{const key=crypto.createHash('sha1').update(q.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');c.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+key+'\r\n\r\n');c.on('data',b=>{if(b.length<6)return;const n=b[1]&127;if(n>125||b.length<6+n)return;const p=Buffer.alloc(n);for(let i=0;i<n;i++)p[i]=b[6+i]^b[2+i%4];if((b[0]&15)===1)c.write(Buffer.concat([Buffer.from([129,n]),p]));else if((b[0]&15)===8){c.end(Buffer.concat([Buffer.from([136,n]),p]));}});});s.listen(3000,'::');`;
const timeout=(ms,label)=>new Promise((_,reject)=>{const t=setTimeout(()=>reject(new Error(label)),ms);t.unref();});
try{
 await initializeCredentialVaultForServer();emit('NATIVE_KMS_STARTUP_PASS');
 await assert.rejects(deliveries.enqueue({...context},randomUUID(),{projectId:project.id,prompt:'denied fabricated context'}));
 await assert.rejects(deliveries.enqueue(context,randomUUID(),{projectId:randomUUID(),prompt:'denied foreign project'}));
 assert.throws(()=>createProjectRuntimeManager(randomUUID(),context));
 emit('FABRICATED_CONTEXT_AND_FOREIGN_PROJECT_DENIED_BEFORE_DISPATCH');
 const runId=randomUUID();ownedRuns.push(runId);
 const input={projectId:project.id,prompt:'Synthetic Batch 1 source85 Preview, no AI generation'};
 const deliveryId=await admitReserved(runId,input);
 assert.equal(await deliveries.enqueue(context,runId,input),deliveryId);
 await runs.withRunAttempt(async()=>{
  const claim=await deliveries.claim(deliveryId,runs.currentRunWorkerId());assert.ok(claim);
  assert.equal(requireCanonicalDeliveryClaim(claim).context.userId,project.user_id);
  await runs.adoptQueuedRunDurable(claim);
  assert.equal(await deliveries.claim(deliveryId,randomUUID()),null);
  assert.throws(()=>requireCanonicalDeliveryClaim({...claim}));
  emit('NATIVE_ISSUED_CLAIM_AND_DUPLICATE_DENIAL_PASS',{runId,deliveryId,generation:claim.generation});
  const files=[{path:'index.html',content:'<!doctype html><h1>Xroga Batch 1 offline Preview fixture</h1>'},{path:'server.js',content:server}];
  const now=new Date().toISOString();
  const software={schemaVersion:'1.0.0',projectId:project.id,runId,contract:{projectId:project.id,runId,createdAt:now,semanticGoal:{goal:'Synthetic offline HTTP and WebSocket verification'}},architecture:null,recipe:{id:'node',label:'Offline synthetic fixture',previewStrategy:'browser'},filePlan:null,workspace:{revision:1,fileCount:files.length,files,updatedAt:now},changeSet:{created:files.map(f=>f.path),modified:[],deleted:[],renamed:[]},lifecycle:{},runtime:null,verification:{status:'not_run',verified:false,reason:'Synthetic source, no AI generation',blockers:[],evidence:[]},repository:null,createdAt:now,updatedAt:now};
  await store.saveRevision(project.user_id,software);
  const result=await startOrRefreshLivePreview({userId:project.user_id,authority:context,project:software,runId,emit:e=>{if(['runtime.started','workspace.created','process.started','preview.failed'].includes(e.type))emit('PREVIEW_STAGE',{stage:e.type,status:e.status});}});
  sessionId=result.preview.sessionId;
  assert.equal(result.preview.status,'ready');assert.equal(result.preview.providerId,'google-gce');
  await store.saveRevision(project.user_id,result.project);
  const session=await store.loadSession(project.user_id,sessionId);assert.ok(session);
  assert.equal(await store.loadSession(randomUUID(),sessionId),null);
  emit('PRIVATE_WORKER_OWNERSHIP_AND_PREVIEW_READY_PASS',{runId,sessionId});
  // Exercise an offline Node workload through the existing isolated-process
  // API, with no package manifest, dependency installation or network bypass.
  const active=session.processes.filter(p=>p.status==='running'&&p.port===3000);assert.equal(active.length,1);
  emit('OFFLINE_HTTP_WEBSOCKET_PROCESS_START');
  await runtime.stopProcess(sessionId,active[0].processId);
  await runtime.startProcess(sessionId,{command:'node',args:['server.js'],cwd:active[0].cwd||'.',networkPolicy:active[0].networkPolicy,port:3000,restartPolicy:'never',secretScopes:[]});
  let response;
  for(let n=0;n<6;n++){
   response=await fetch(result.preview.url,{signal:AbortSignal.timeout(20000)});
   if(response.status===200)break;
   await new Promise(r=>setTimeout(r,1000));
  }
  emit('LIVE_PREVIEW_HTTP_RESULT',{status:response.status});
  assert.equal(response.status,200);assert.match(await response.text(),/Xroga Batch 1 offline Preview fixture/);
  const wsUrl=new URL(result.preview.url);wsUrl.protocol='wss:';wsUrl.pathname='/socket';
  openSocket=new WebSocket(wsUrl);
  await Promise.race([new Promise((resolve,reject)=>{openSocket.onopen=()=>openSocket.send('batch1-source85-echo');openSocket.onmessage=e=>{try{assert.equal(e.data,'batch1-source85-echo');resolve();}catch(err){reject(err);}};openSocket.onerror=()=>reject(new Error('WS_CONNECT_FAILED'));}),timeout(20000,'WS_ECHO_TIMEOUT')]);
  emit('LIVE_PREVIEW_HTTP_AND_WEBSOCKET_PASS',{runId,sessionId});
  const closed=new Promise(resolve=>{openSocket.onclose=()=>resolve(true);});
  await revokeLivePreviewGrants({userId:project.user_id,projectId:project.id});
  const revoked=await fetch(result.preview.url,{signal:AbortSignal.timeout(20000)});
  assert.ok([404,410].includes(revoked.status));
  await Promise.race([closed,timeout(20000,'REVOKED_WS_NOT_CLOSED')]);
  emit('LIVE_GRANT_REVOCATION_HTTP_AND_OPEN_WEBSOCKET_PASS',{sessionId,httpStatus:revoked.status});
  openSocket=null;
  await runtime.destroy(sessionId);assert.equal((await runtime.binding(sessionId)).status,'destroyed');
  emit('PRIVATE_WORKER_TERMINATION_AND_SAVED_STATE_PASS',{sessionId});sessionId=null;
  runs.completeRun(runId,{success:true,output:{type:'infrastructure_fixture',fixtureOnly:true,modelGeneration:false}});
  assert.equal(await runs.persistTerminalRunAuthority(runId,project.user_id),'complete');
  await deliveries.recordResult(claim,true,[]);assert.equal((await deliveries.loadResult(context,runId)).success,true);
  emit('DURABLE_SYNTHETIC_COMPLETION_PASS',{runId,deliveryId});
 });
 // A real child process saves a fenced checkpoint, is killed, and is resumed
 // explicitly under a new native claim. No VM or external action is replayed.
 const recoveryRun=randomUUID();ownedRuns.push(recoveryRun);
 const nonce=randomUUID(),prompt='Synthetic Batch 1 process-loss '+nonce;
 const lostDelivery=await admitReserved(recoveryRun,{projectId:project.id,prompt});
 const childSource=String.raw`import assert from 'node:assert/strict';await import('file:///app/dist/runtime/installSafeLogging.js');await import('file:///app/dist/loadPlatformEnvironment.js');const {GoogleDeliveryStore}=await import('file:///app/dist/workers/googleDeliveryStore.js');const {googleDispatchConfiguration}=await import('file:///app/dist/workers/googleDispatch.js');const r=await import('file:///app/dist/ai/runStore.js');const c=await import('file:///app/dist/ai/softwareAgent/softwareAgentCheckpoint.js');process.once('message',async input=>{try{await r.withRunAttempt(async()=>{const d=new GoogleDeliveryStore(googleDispatchConfiguration());const claim=await d.claim(input.deliveryId,r.currentRunWorkerId());assert.ok(claim);await r.adoptQueuedRunDurable(claim);const cap=r.captureAdmittedRunAttempt(claim.runId,claim.userId);const checkpoint={schemaVersion:'1.0.0',runId:claim.runId,projectId:input.projectId,repository:null,baseFingerprint:c.softwareAgentBaseFingerprint([]),changes:[{path:'batch1-recovery.txt',kind:'created',content:input.content}],evidence:{changedFiles:[],checks:[]},status:'active',blockers:[],failureCode:null,updatedAt:new Date().toISOString()};await new c.SupabaseSoftwareAgentCheckpointStore(claim.userId,cap).save(checkpoint);process.send({ready:true,claim,checkpoint});setInterval(()=>{},1000);});}catch{process.send({ready:false});process.exitCode=1;}});`;
 child=spawn(process.execPath,['--input-type=module','-e',childSource],{env:{...bootEnvironment,NODE_OPTIONS:''},stdio:['ignore','ignore','ignore','ipc']});
 const content='Synthetic durable source '+nonce+'\n';
 const ready=new Promise((resolve,reject)=>{child.once('message',v=>v.ready?resolve(v):reject(new Error('CHILD_CHECKPOINT_DENIED')));child.once('error',reject);});
 child.send({deliveryId:lostDelivery,projectId:project.id,content});
 const saved=await Promise.race([ready,timeout(60000,'CHILD_CHECKPOINT_TIMEOUT')]);
 const terminated=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
 child.kill('SIGKILL');assert.equal((await terminated).signal,'SIGKILL');child=null;
 assert.equal(await failInFlightRuns([recoveryRun],'worker_lost',{workerId:saved.claim.workerId}),1);
 const resumed=await admitReserved(recoveryRun,{projectId:project.id,prompt,clientMeta:{resumeRun:true}});
 await runs.withRunAttempt(async()=>{
  const claim=await deliveries.claim(resumed,runs.currentRunWorkerId());assert.ok(claim);assert.notEqual(claim.generation,saved.claim.generation);
  await runs.adoptQueuedRunDurable(claim);
  const capability=runs.captureAdmittedRunAttempt(recoveryRun,project.user_id);
  const cpStore=new checkpoints.SupabaseSoftwareAgentCheckpointStore(project.user_id,capability);
  const scoped=checkpoints.bindSoftwareCheckpointRecovery(cpStore,{runId:recoveryRun,projectId:project.id,repository:null,baseFiles:[]});
  const loaded=await scoped.load(recoveryRun);assert.ok(loaded);
  const files=checkpoints.workingFilesFromCheckpoint([],loaded);assert.equal(files[0].content,content);
  assert.equal(await new checkpoints.SupabaseSoftwareAgentCheckpointStore(randomUUID()).load(recoveryRun),null);
  await cpStore.save({...loaded,updatedAt:new Date().toISOString()});
  const stale=await db.rpc('persist_software_checkpoint_attempt',{p_run_id:recoveryRun,p_owner_id:project.user_id,p_worker_id:saved.claim.workerId,p_generation:saved.claim.generation,p_checkpoint:saved.checkpoint});
  assert.equal(stale.error,null);assert.equal(stale.data,false);
  assert.equal(await deliveries.claim(lostDelivery,randomUUID()),null);
  runs.completeRun(recoveryRun,{success:true,output:{type:'infrastructure_fixture',fixtureOnly:true,modelGeneration:false}});
  assert.equal(await runs.persistTerminalRunAuthority(recoveryRun,project.user_id),'complete');await deliveries.recordResult(claim,true,[]);
  emit('REAL_PROCESS_KILL_DURABLE_RECOVERY_AND_STALE_GENERATION_DENIAL_PASS',{runId:recoveryRun,generation:claim.generation,contentSha256:createHash('sha256').update(content).digest('hex')});
 });
 const cancelledRun=randomUUID();ownedRuns.push(cancelledRun);
 const cancelledDelivery=await admitReserved(cancelledRun,{projectId:project.id,prompt:'Synthetic cancellation before external dispatch'});
 assert.equal(await runs.requestRunCancellation(cancelledRun,randomUUID()),false);
 assert.equal(await runs.requestRunCancellation(cancelledRun,project.user_id),true);
 assert.equal((await deliveries.reserve(cancelledDelivery)).state,'acknowledged');
 assert.equal(await deliveries.claim(cancelledDelivery,randomUUID()),null);
 const transport=new GoogleCanonicalDispatch(googleDispatchConfiguration());
 const task=await transport.enqueue(cancelledDelivery);assert.equal((await transport.enqueue(cancelledDelivery)).duplicate,true);
 emit('CANCELLATION_OWNERSHIP_RETRY_DENIAL_AND_REAL_TASK_SUBMISSION_PASS',{runId:cancelledRun,deliveryId:cancelledDelivery,taskName:task.taskName});
 const tokenRows=await db.from('swarm_runs').select('id,token_usage,status').in('id',ownedRuns).eq('user_id',project.user_id);
 assert.equal(tokenRows.error,null);assert.equal(tokenRows.data.length,3);
 assert.ok(tokenRows.data.every(v=>v.token_usage===null||Object.values(v.token_usage).every(n=>n===0||n===null)));
 emit('NO_MODEL_CALLS_NO_FABRICATED_TOKEN_USAGE_PASS');
 emit('ALL_BOUNDED_MODEL_FREE_CHECKS_PASS');
}catch(error){emit('STOPPED',{lastCheck,errorName:error?.name,errorCode:error?.code??null,actual:typeof error?.actual==='number'||['ready','failed','running','stopped','destroyed','reserved','acknowledged','complete',null,false,true].includes(error?.actual)?error.actual:undefined,message:/^[A-Z0-9_]+$/.test(error?.message??'')?error.message:'FIXTURE_CHECK_FAILED'});process.exitCode=1;}
finally{
 if(openSocket)openSocket.close();
 if(child)child.kill('SIGKILL');
 if(sessionId){try{await runtime.destroy(sessionId);await revokeLivePreviewGrants({userId:project.user_id,projectId:project.id});emit('FAILURE_WORKER_CLEANUP_PASS',{sessionId});}catch{emit('EXACT_WORKER_CLEANUP_REQUIRED',{sessionId});process.exitCode=1;}}
 for(const id of ownedRuns){try{await failInFlightRuns([id],'worker_lost',{workerId:runs.currentRunWorkerId()});}catch{process.exitCode=1;}}
}
await new Promise(r=>setTimeout(r,100));
process.exit(process.exitCode??0);
