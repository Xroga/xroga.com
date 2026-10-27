import assert from 'node:assert/strict';
import test from 'node:test';
import {selectSandboxProvider,setSandboxProvidersForTesting,configureFlyMachineSandboxProvider} from './sandboxProviders.js';
import {executeSandboxed} from './sandboxRuntime.js';
import {DEFAULT_SANDBOX_LIMITS,SandboxAdmissionError} from './sandboxTypes.js';

test('explicit Google mode cannot probe or fall back to a registered Fly provider after absence or denial',async()=>{
  const prior=process.env.XROGA_PROJECT_RUNTIME_PROVIDER;process.env.XROGA_PROJECT_RUNTIME_PROVIDER='google-gce';
  let fly=0,native=0;let available=false;
  setSandboxProvidersForTesting([
    {name:'fly-machines',async probe(){fly++;return{available:true,runtime:'fly-machines'};},async execute(){fly++;throw new Error('Fly must remain unused');}},
    {name:'google-gce',async probe(){native++;return{available,runtime:'google-gce',networkIsolation:true};},async execute(){throw new SandboxAdmissionError();}},
  ]);
  try{
    assert.equal((await selectSandboxProvider()).runtime,null);assert.equal(fly,0);
    assert.equal(configureFlyMachineSandboxProvider({XROGA_PROJECT_RUNTIME_PROVIDER:'google-gce',XROGA_SANDBOX_FLY_APP:'synthetic',XROGA_SANDBOX_FLY_TOKEN:'PRIVATE_CANARY'}),null);
    available=true;
    await assert.rejects(executeSandboxed({files:[],command:'true',args:[],timeoutMs:1000,networkPolicy:'none',environment:{},limits:DEFAULT_SANDBOX_LIMITS}),SandboxAdmissionError);
    assert.equal(native,1,'unissued execution is denied before another external probe');assert.equal(fly,0);
  }finally{if(prior===undefined)delete process.env.XROGA_PROJECT_RUNTIME_PROVIDER;else process.env.XROGA_PROJECT_RUNTIME_PROVIDER=prior;setSandboxProvidersForTesting(null);}
});
