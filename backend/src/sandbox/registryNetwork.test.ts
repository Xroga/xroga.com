import test from 'node:test';
import assert from 'node:assert/strict';
import {ContainerSandboxRuntime,buildContainerArgs} from './sandboxProviders.js';
import {RemoteSandboxRuntime} from './remoteSandbox.js';
import {FlyMachineSandboxRuntime,buildExecCommand} from './flyMachineSandbox.js';
import {executeSandboxed,setSandboxRuntimeForTesting} from './sandboxRuntime.js';
import {DEFAULT_SANDBOX_LIMITS} from './sandboxTypes.js';
import {ProjectRuntimeManager} from '../synthesis/projectRuntime/manager.js';
import {InMemoryProjectRuntimeStore} from '../synthesis/projectRuntime/store.js';
import {FlyProjectRuntimeProvider,executableLine} from '../synthesis/projectRuntime/flyProvider.js';
import type {ProjectRuntimeSession} from '../synthesis/projectRuntime/types.js';

const request={files:[],command:'npm',args:['install'],timeoutMs:1000,networkPolicy:'registry-only' as const,environment:{},limits:DEFAULT_SANDBOX_LIMITS};
test('registry-only cannot reach selection, container spawn, remote worker or Fly allocation',async t=>{
  let probes=0,effects=0;
  setSandboxRuntimeForTesting({name:'unverified',probe:async()=>{probes++;return {available:true,runtime:'unverified',networkIsolation:true};},execute:async()=>{effects++;throw Error('must not execute');}});
  t.after(()=>setSandboxRuntimeForTesting(null));
  const denied=(e:unknown)=>(e as {code?:string;reason?:string}).code==='SANDBOX_UNAVAILABLE'&&(e as {reason?:string}).reason==='policy_disabled';
  await assert.rejects(executeSandboxed(request),denied);
  await assert.rejects(new ContainerSandboxRuntime({binary:'must-never-be-probed'}).execute(request),denied);
  const fetchImpl=(async()=>{effects++;throw Error('must not send source or allocate');}) as typeof fetch;
  await assert.rejects(new RemoteSandboxRuntime({url:'https://worker.example',fetchImpl}).execute(request),denied);
  await assert.rejects(new FlyMachineSandboxRuntime({app:'xroga-synthetic-sandbox',token:'synthetic-not-a-token',fetchImpl}).execute(request),denied);
  assert.throws(()=>buildContainerArgs('node:22-bookworm',request),denied);
  assert.throws(()=>buildExecCommand('npm',['install'],'registry-only'),denied);
  assert.equal(probes,0);assert.equal(effects,0);
});

test('persistent runtime registry-only commands and processes refuse before state, secret or provider access',async t=>{
  let reads=0,effects=0;const store=new InMemoryProjectRuntimeStore();
  t.mock.method(store,'loadSession',async()=>{reads++;throw Error('must not resolve state or secrets');});
  const manager=new ProjectRuntimeManager('owner',store,[]);
  const command={command:'npm',args:['ci'],networkPolicy:'registry-only' as const};
  await assert.rejects(manager.exec('synthetic-session',command),/verified restricted-network/);
  await assert.rejects(manager.startProcess('synthetic-session',command),/verified restricted-network/);
  const provider=new FlyProjectRuntimeProvider({app:'xroga-synthetic-runtime',token:'synthetic-only',fetchImpl:(async()=>{effects++;throw Error('must not dispatch');}) as typeof fetch});
  const session={sessionId:'synthetic-session',userId:'owner',projectId:'synthetic-project',providerState:{machineId:'synthetic'}} as ProjectRuntimeSession;
  await assert.rejects(provider.exec(session,command),/verified restricted-network/);
  await assert.rejects(provider.startProcess(session,command),/verified restricted-network/);
  assert.throws(()=>executableLine('npm',['ci'],'registry-only'),/verified restricted-network/);
  assert.equal(reads,0);assert.equal(effects,0);
});
