import assert from 'node:assert/strict';
import test from 'node:test';
import {GoogleCanonicalDispatch,GoogleDispatchError,type GoogleDispatchConfiguration} from './googleDispatch.js';
import type {GceApi} from '../sandbox/google/gceMachineControl.js';
const project='project-c40d4821-e647-4fa2-92d';
const configuration:GoogleDispatchConfiguration={project,region:'us-east4',queue:'xroga-canonical-queue',job:'xroga-canonical-worker',
  dispatcherUrl:'https://xroga-dispatcher-fixture.us-east4.run.app/internal/canonical-dispatch',
  dispatchAccount:`xroga-dispatcher@${project}.iam.gserviceaccount.com`,runtimeAccount:`xroga-api-runtime@${project}.iam.gserviceaccount.com`,
  image:`us-east4-docker.pkg.dev/${project}/cloud-run-source-deploy/xroga-api-migration@sha256:${'a'.repeat(64)}`,sourceSha:'b'.repeat(40),kmsKeyName:`projects/${project}/locations/us-central1/keyRings/synthetic/cryptoKeys/custody`};
const id='11111111-1111-4111-8111-111111111111';
const code=(value:string)=>(e:unknown)=>e instanceof GoogleDispatchError&&e.code===value;
function fixture(){
  const calls:{url:string;method:string;data?:any;retry?:boolean}[]=[];
  const job={name:`projects/${project}/locations/us-east4/jobs/xroga-canonical-worker`,etag:'pinned-etag',labels:{'xroga-source-sha':configuration.sourceSha},template:{taskCount:1,parallelism:1,
    template:{serviceAccount:configuration.runtimeAccount,maxRetries:0,timeout:'3600s',containers:[{name:'worker',image:configuration.image,
      command:['node','dist/scripts/runCanonicalWorker.js'],env:Object.entries({NODE_ENV:'production',XROGA_RUNTIME_ROLE:'canonical-worker',XROGA_PROJECT_RUNTIME_PROVIDER:'google-gce',XROGA_BACKGROUND_EXECUTION_PROVIDER:'google-jobs',XROGA_CREDENTIAL_KMS_PROVIDER:'google_cloud',XROGA_GOOGLE_CLOUD_AUTH_MODE:'metadata_adc',XROGA_GOOGLE_CLOUD_KMS_KEY_NAME:configuration.kmsKeyName}).map(([name,value])=>({name,value}))}]}}};
  let deny=false,duplicate=false,badReceipt=false;
  const api={async request(input:any){calls.push(input);if(input.url.includes('cloudtasks')){
    if(duplicate)throw {response:{status:409}};return{data:{name:badReceipt?'foreign':input.data.task.name}};}
    if(input.method==='GET')return{data:job};return{data:{name:`projects/${project}/locations/us-east4/operations/fixture`}};}} as GceApi;
  return{calls,job,deny:()=>{deny=true;},duplicate:()=>{duplicate=true;},badReceipt:()=>{badReceipt=true;},
    transport:new GoogleCanonicalDispatch(configuration,api,async account=>{assert.equal(account,configuration.runtimeAccount);if(deny)throw new Error('PRIVATE_CREDENTIAL_CANARY');})};
}
test('durable task is deterministically named and carries only the delivery ID and fixed audience',async()=>{
  const f=fixture();const first=await f.transport.enqueue(id);f.duplicate();const second=await f.transport.enqueue(id);
  assert.equal(first.taskName,second.taskName);assert.equal(second.duplicate,true);
  const task=f.calls[0].data.task;assert.deepEqual(JSON.parse(Buffer.from(task.httpRequest.body,'base64').toString()),{deliveryId:id});
  assert.equal(task.httpRequest.oidcToken.audience,new URL(configuration.dispatcherUrl).origin);
  assert.equal(f.calls[0].retry,false);
});
test('native identity denial, malformed delivery and unverifiable task receipt fail without fallback',async()=>{
  const f=fixture();f.deny();await assert.rejects(f.transport.enqueue(id),code('DISPATCH_IDENTITY_DENIED'));assert.equal(f.calls.length,0);
  await assert.rejects(f.transport.launch('raw-user-id'),code('DISPATCH_CONFIGURATION_INVALID'));assert.equal(f.calls.length,0);
  const g=fixture();g.badReceipt();await assert.rejects(g.transport.enqueue(id),code('DISPATCH_RESULT_UNVERIFIED'));assert.equal(g.calls.length,1);
});
test('job launch is source-bound and etag-bound, with one task and only delivery ID override',async()=>{
  const f=fixture();assert.ok((await f.transport.launch(id)).operationName.endsWith('/fixture'));
  assert.equal(f.calls.length,2);assert.deepEqual(f.calls[1].data,{etag:'pinned-etag',overrides:{taskCount:1,timeout:'3600s',containerOverrides:[{name:'worker',args:[id]}]}});
  assert.ok(f.calls.every(call=>call.retry===false));
});
test('wrong image, service identity, source, retry policy or entrypoint prevents any launch',async()=>{
  for(const mutate of [(f:ReturnType<typeof fixture>)=>{f.job.template.template.containers[0].image+=':latest';},
    (f:ReturnType<typeof fixture>)=>{f.job.template.template.serviceAccount='foreign';},
    (f:ReturnType<typeof fixture>)=>{f.job.labels['xroga-source-sha']='c'.repeat(40);},
    (f:ReturnType<typeof fixture>)=>{f.job.template.template.maxRetries=1;},
    (f:ReturnType<typeof fixture>)=>{f.job.template.template.containers[0].env.find(e=>e.name==='XROGA_PROJECT_RUNTIME_PROVIDER')!.value='fly';},
    (f:ReturnType<typeof fixture>)=>{f.job.template.template.containers[0].env.find(e=>e.name==='XROGA_CREDENTIAL_KMS_PROVIDER')!.value='legacy';},
    (f:ReturnType<typeof fixture>)=>{f.job.template.template.containers[0].env.push({name:'XROGA_RELEASE_SHA',value:configuration.sourceSha});},
    (f:ReturnType<typeof fixture>)=>{f.job.template.template.containers[0].command=['sh','-c','echo fake'];}]){
    const f=fixture();mutate(f);await assert.rejects(f.transport.launch(id),code('DISPATCH_JOB_NOT_ADMITTED'));assert.equal(f.calls.length,1);
  }
});
