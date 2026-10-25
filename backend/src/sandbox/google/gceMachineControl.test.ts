import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { Compute } from 'google-auth-library';
import { attachedGceIdentity, executionBinding, GceMachineControl,
  type CreateGceExecution, type GceApi, type GceExecutionHandle } from './gceMachineControl.js';

const configuration = {project:'synthetic-project', zone:'us-central1-a',
  subnet:'projects/synthetic-project/regions/us-central1/subnetworks/xroga-verify-subnet',
  imageName:'xroga-exec-synthetic', imageId:'123456789',
  serviceAccount:'synthetic-runtime@synthetic-project.iam.gserviceaccount.com',
  admittedImages:[`node@sha256:${'a'.repeat(64)}`]};
const workerSource = '# Synthetic control source, not a live worker';
const workerDigest = createHash('sha256').update(workerSource).digest('hex');
const input = (): CreateGceExecution => ({runtimeId:randomUUID(),ownerReference:'synthetic-owner',scopeReference:'synthetic-project-owner',
  ttlSeconds:600, memoryMb:512,diskMb:512,maxProcesses:64,cpus:1});

function fixture() {
  const creation = input();
  const handle: GceExecutionHandle = {name:'xroga-exec-'+creation.runtimeId.replaceAll('-',''),instanceId:'1234567',
    ...executionBinding(creation),expiresAtEpoch:Math.floor(Date.now()/1000)+creation.ttlSeconds};
  const machine = {id:handle.instanceId,name:handle.name,status:'RUNNING',serviceAccounts:[],
    labels:{'xroga-runtime':handle.runtimeId,'xroga-owner':handle.ownerBinding,'xroga-project':handle.projectBinding},
    networkInterfaces:[{networkIP:'10.90.0.2',subnetwork:'https://www.googleapis.com/compute/v1/'+configuration.subnet}],
    metadata:{items:[{key:'xroga-expires-at',value:String(handle.expiresAtEpoch)},
      {key:'xroga-control-sha256',value:workerDigest}]}};
  const calls: {method: string; url: string; data?: unknown}[] = [];
  const hosts = {queryValue:{items:[{key:'ssh-ed25519',namespace:'hostkeys',
    value:'ssh-ed25519 '+Buffer.alloc(51,1).toString('base64')}]}};
  const api: GceApi = {async request<T>(options: Parameters<GceApi['request']>[0]) {
    calls.push(options);
    let value: unknown;
    if(options.url.includes('/global/images/')) value={id:configuration.imageId,status:'READY'};
    else if(options.method==='POST') {
      const body=options.data as typeof machine;
      machine.labels=body.labels;
      machine.metadata.items=(body.metadata.items as {key: string;value: string}[]);
      handle.expiresAtEpoch=Number(machine.metadata.items.find(item=>item.key==='xroga-expires-at')!.value);
      value={name:'operation-synthetic'};
    } else if(options.url.includes('/instances?maxResults=')) value={items:[]};
    else if(options.url.includes('/operations/')) value={status:'DONE'};
    else if(options.url.includes('/disks/')) value={sourceImageId:configuration.imageId};
    else if(options.url.includes('/getGuestAttributes')) value=hosts;
    else if(options.method==='DELETE') value={name:'delete-synthetic'};
    else value=machine;
    return {data:value as T};
  }};
  return {creation,handle,machine,hosts,calls,api,control:new GceMachineControl(configuration,api,workerSource)};
}

test('native execution uses metadata identity and rejects static, personal and mixed identity configuration', () => {
  assert.ok(attachedGceIdentity({}) instanceof Compute);
  for(const name of ['GOOGLE_APPLICATION_CREDENTIALS','GOOGLE_CREDENTIALS','CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE',
    'GCE_METADATA_HOST','GCE_METADATA_IP','FLY_APP_NAME','FLY_MACHINE_ID','XROGA_GOOGLE_WIF_AUDIENCE']) {
    assert.throws(()=>attachedGceIdentity({[name]:'PRIVATE_CANARY'}),{message:'NATIVE_GCE_IDENTITY_REQUIRED'});
  }
});

test('bounded instance creation uses no SA, no automatic restart and native hard deletion', async () => {
  const f=fixture();const created=await f.control.create(f.creation);
  assert.equal(created.instanceId,f.handle.instanceId);
  const request=f.calls.find(call=>call.method==='POST')!;
  const body=request.data as {serviceAccounts: unknown[];scheduling: Record<string,unknown>;metadata: unknown};
  assert.deepEqual(body.serviceAccounts,[]);
  assert.deepEqual(body.scheduling,{automaticRestart:false,onHostMaintenance:'MIGRATE',instanceTerminationAction:'DELETE',maxRunDuration:{seconds:'600'}});
  assert.ok(!JSON.stringify(request).includes(f.creation.ownerReference));
  assert.ok(!JSON.stringify(request).includes(f.creation.scopeReference));
  assert.ok(request.url.includes('requestId='));
});

test('foreign or malformed ownership and expired handles are denied before any cloud request', async () => {
  for(const patch of [{ownerBinding:''},{projectBinding:'raw-user-id'},{instanceId:'not-an-id'},
    {runtimeId:'-'.repeat(36)},{expiresAtEpoch:0}]) {
    const f=fixture();await assert.rejects(f.control.resolve({...f.handle,...patch}),/GCE_RUNTIME_EXPIRED_OR_INVALID|INVALID_GCE_EXECUTION_REFERENCE/);
    assert.equal(f.calls.length,0);
  }
});

test('owner or project drift refuses access before disk, host-key or SSH dispatch', async () => {
  for(const name of ['xroga-owner','xroga-project'] as const) {
    const f=fixture();f.machine.labels[name]='foreign';
    await assert.rejects(f.control.resolve(f.handle),{message:'GCE_RUNTIME_IDENTITY_OR_OWNER_MISMATCH'});
    assert.equal(f.calls.length,1);
  }
});

test('immutable source-image drift and permission denial never provision a replacement', async () => {
  for(const failure of ['drift','permission']) {
    let calls=0;
    const api: GceApi = {async request<T>() {
      calls++;
      if(failure==='permission')throw Object.assign(new Error('PRIVATE_PROVIDER_ERROR_CANARY'),{response:{status:403}});
      return {data:{id:'999',status:'READY'} as T};
    }};
    const control=new GceMachineControl(configuration,api,workerSource);
    await assert.rejects(control.create(input()),{message:failure==='drift'?'GCE_BASE_IMAGE_IDENTITY_MISMATCH':'GCE_CONTROL_PERMISSION_DENIED'});
    assert.equal(calls,1);
  }
});

test('a missing or substituted host key cannot become trust-on-first-use', async () => {
  const f=fixture();f.hosts.queryValue.items=[];
  await assert.rejects(f.control.resolve(f.handle),{message:'GCE_SSH_HOST_IDENTITY_NOT_READY'});
  assert.ok(!f.calls.some(call=>call.method!=='GET'));
});

test('destruction checks ownership, permits expired cleanup and waits for authoritative deletion', async () => {
  const denied=fixture();denied.machine.labels['xroga-owner']='foreign';
  await assert.rejects(denied.control.destroy(denied.handle),{message:'GCE_RUNTIME_IDENTITY_OR_OWNER_MISMATCH'});
  assert.ok(!denied.calls.some(call=>call.method==='DELETE'));
  const f=fixture();f.handle.expiresAtEpoch=1;
  f.machine.metadata.items.find(item=>item.key==='xroga-expires-at')!.value='1';
  f.hosts.queryValue.items=[];
  await f.control.destroy(f.handle);
  assert.equal(f.calls.filter(call=>call.method==='DELETE').length,1);
  assert.ok(f.calls.at(-1)!.url.includes('/operations/delete-synthetic'));
});

test('resource and TTL escalation are rejected before image lookup or provisioning', async () => {
  for(const patch of [{ttlSeconds:7201},{ttlSeconds:0},{diskMb:32768},{memoryMb:65536},{maxProcesses:10000},{cpus:4}]) {
    const f=fixture();await assert.rejects(f.control.create({...f.creation,...patch}),{message:'INVALID_GCE_EXECUTION_BOUNDS'});
    assert.equal(f.calls.length,0);
  }
});

test('actual fleet capacity blocks another billable instance before provisioning',async()=>{
  let provisions=0;
  const api:GceApi={async request<T>(options: Parameters<GceApi['request']>[0]) {
    if(options.method==='POST')provisions++;
    return {data:(options.url.includes('/global/images/')?{id:configuration.imageId,status:'READY'}:
      {items:[{name:'xroga-exec-'+ 'a'.repeat(32)},{name:'xroga-exec-'+ 'b'.repeat(32)}]}) as T};
  }};
  await assert.rejects(new GceMachineControl(configuration,api,workerSource).create(input()),{message:'GCE_EXECUTION_CAPACITY_RESERVED'});
  assert.equal(provisions,0);
});
