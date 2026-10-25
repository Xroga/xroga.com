import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { GceControlError, type GceApi, type GceExecutionHandle } from './gceMachineControl.js';
import { GceSshTransport, type NativeCommand } from './gceSshTransport.js';

// Synthetic OS Login replies and child-process fixtures. Not live SSH evidence.
async function fixture() {
  const directory=await mkdtemp(join(tmpdir(),'xroga-native-ssh-fixture-'));
  const prefix=resolve(tmpdir(),'xroga-native-ssh-fixture-');
  let cleaned=false,keyRequests=0;
  const publicKey='ssh-ed25519 '+Buffer.alloc(51,2).toString('base64');
  const handle: GceExecutionHandle={name:'xroga-exec-'+'a'.repeat(32),instanceId:'123456789',
    runtimeId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',ownerBinding:'b'.repeat(40),projectBinding:'c'.repeat(40),expiresAtEpoch:Math.floor(Date.now()/1000)+600};
  const control={configuration:{project:'synthetic-project',zone:'us-central1-a',
    subnet:'projects/synthetic-project/regions/us-central1/subnetworks/xroga-verify-subnet',
    imageName:'xroga-exec-synthetic',imageId:'123',admittedImages:[],
    serviceAccount:'synthetic-runtime@synthetic-project.iam.gserviceaccount.com'},
    async resolve(_handle: GceExecutionHandle){return{privateIp:'10.90.0.2',sshHostKey:publicKey};}};
  const calls: {method: string;url: string;data?: unknown}[]=[];
  const commands: {binary: string;args: readonly string[];input: string;timeoutMs: number}[]=[];
  const api: GceApi={async request<T>(options: Parameters<GceApi['request']>[0]){calls.push(options);return {data:(options.method==='POST'
    ? {loginProfile:{posixAccounts:[{primary:true,username:'sa_123456789',operatingSystemType:'LINUX'}],
      sshPublicKeys:{['d'.repeat(64)]:{key:publicKey,expirationTimeUsec:(options.data as {expirationTimeUsec: string}).expirationTimeUsec}}}} : {}) as T};}};
  const command: NativeCommand=async(binary,args,input,timeoutMs)=>{
    commands.push({binary,args,input,timeoutMs});return{code:0,stdout:JSON.stringify({ok:true,result:{available:true}})};
  };
  const keyFactory=async()=>{keyRequests++;return{directory,privatePath:join(directory,'synthetic-private-key-never-used'),publicKey,
    async cleanup(){assert.ok(resolve(directory).startsWith(prefix));await rm(directory,{recursive:true,force:true});cleaned=true;}};};
  return{directory,handle,control,calls,commands,api,command,keyFactory,
    get cleaned(){return cleaned;},get keyRequests(){return keyRequests;},
    transport:new GceSshTransport(control,api,command,keyFactory)};
}

test('native transport pins host identity, obtains the SA username and keeps operation credentials on stdin',async()=>{
  const f=await fixture();
  assert.deepEqual(await f.transport.run(f.handle,{operation:'probe',environment:{PROJECT_TOKEN:'PRIVATE_PROJECT_CANARY'}},5000),{available:true});
  assert.equal(f.commands.length,1);
  const invocation=f.commands[0];
  assert.ok(invocation.args.includes('StrictHostKeyChecking=yes'));
  assert.ok(invocation.args.includes('IdentitiesOnly=yes'));
  assert.ok(invocation.args.includes('sa_123456789@10.90.0.2'));
  assert.ok(!invocation.args.join(' ').includes('PRIVATE_PROJECT_CANARY'));
  assert.ok(invocation.input.includes('PRIVATE_PROJECT_CANARY'));
  assert.ok(f.calls[0].url.includes('synthetic-runtime%40synthetic-project.iam.gserviceaccount.com'));
  assert.ok(f.calls.at(-1)!.method==='DELETE');
  assert.ok(f.cleaned);
});

test('ownership and expiry denial creates no key, import, SSH session or fallback',async()=>{
  const f=await fixture();f.control.resolve=async()=>{throw new GceControlError('GCE_RUNTIME_IDENTITY_OR_OWNER_MISMATCH');};
  await assert.rejects(f.transport.run(f.handle,{operation:'probe'},5000),{message:'GCE_RUNTIME_IDENTITY_OR_OWNER_MISMATCH'});
  assert.equal(f.keyRequests,0);assert.equal(f.calls.length,0);assert.equal(f.commands.length,0);
  assert.ok(resolve(f.directory).startsWith(resolve(tmpdir(),'xroga-native-ssh-fixture-')));
  await rm(f.directory,{recursive:true,force:true});
});

test('existing ten-minute commands remain bounded and do not trigger another dispatch',async()=>{
  const f=await fixture();
  await f.transport.run(f.handle,{operation:'exec',timeoutMs:600000},600000);
  assert.equal(f.commands.length,1);
  assert.equal(f.commands[0].timeoutMs,630000);
  await assert.rejects(f.transport.run(f.handle,{operation:'exec'},600001),{message:'INVALID_NATIVE_SSH_TIMEOUT'});
  assert.equal(f.commands.length,1);
});

test('OS Login denial prevents remote dispatch and removes ephemeral key material',async()=>{
  const f=await fixture();
  const denied:GceApi={async request(){throw new Error('PRIVATE_AUTHENTICATION_ERROR_CANARY');}};
  const transport=new GceSshTransport(f.control,denied,f.command,f.keyFactory);
  await assert.rejects(transport.run(f.handle,{operation:'probe'},5000),{message:'NATIVE_OS_LOGIN_ADMISSION_DENIED'});
  assert.equal(f.commands.length,0);assert.ok(f.cleaned);
});

test('malformed, denied and interrupted receipts never become successful completion or credential leaks',async()=>{
  for(const result of [{code:255,stdout:'PRIVATE_STDOUT_CANARY'}, {code:0,stdout:'PRIVATE_MALFORMED_CANARY'},
    {code:0,stdout:JSON.stringify({ok:false,code:'PRIVATE_DENIAL_CANARY'})}]) {
    const f=await fixture();let dispatched=0;
    const transport=new GceSshTransport(f.control,f.api,async()=>{dispatched++;return result;},f.keyFactory);
    await assert.rejects(transport.run(f.handle,{operation:'probe'},5000),error=>
      error instanceof GceControlError && !error.message.includes('PRIVATE_'));
    assert.equal(dispatched,1);assert.ok(f.cleaned);assert.equal(f.calls.at(-1)!.method,'DELETE');
  }
});

test('failed key revocation is reported, private material is removed and work is never retried',async()=>{
  const f=await fixture();
  const api:GceApi={async request<T>(options: Parameters<GceApi['request']>[0]){if(options.method==='DELETE')throw new Error('PRIVATE_REVOCATION_CANARY');return f.api.request<T>(options);}};
  const transport=new GceSshTransport(f.control,api,f.command,f.keyFactory);
  await assert.rejects(transport.run(f.handle,{operation:'probe'},5000),{message:'NATIVE_SSH_KEY_REVOCATION_PENDING'});
  assert.equal(f.commands.length,1);assert.ok(f.cleaned);
});

test('a missing expiry or developer account cannot substitute for the issued service identity',async()=>{
  for(const mode of ['expiry','developer']) {
    const f=await fixture();
    const api:GceApi={async request<T>(options: Parameters<GceApi['request']>[0]){
      const response=await f.api.request<{loginProfile?: {posixAccounts: {username: string}[];sshPublicKeys: Record<string,{expirationTimeUsec?: string}>}}>(options);
      if(options.method==='POST') {
        if(mode==='expiry')delete response.data.loginProfile!.sshPublicKeys['d'.repeat(64)].expirationTimeUsec;
        else response.data.loginProfile!.posixAccounts[0].username='developer';
      }
      return response as {data:T};
    }};
    await assert.rejects(new GceSshTransport(f.control,api,f.command,f.keyFactory).run(f.handle,{operation:'probe'},5000),
      {message:mode==='expiry'?'NATIVE_OS_LOGIN_KEY_EXPIRY_INVALID':'NATIVE_OS_LOGIN_PRINCIPAL_AMBIGUOUS'});
    assert.equal(f.commands.length,0);assert.ok(f.cleaned);
  }
});
