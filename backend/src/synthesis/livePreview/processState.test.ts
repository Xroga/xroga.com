import assert from 'node:assert/strict';
import {test} from 'node:test';
import {projectRuntimeProcessRunning} from './processState.js';

test('native process status never probes a different command container PID namespace',async()=>{
  let commands=0;
  const runtime={async probeProcess(session:string,process:string){assert.equal(session,'owned-session');assert.equal(process,'owned-process');return true;},
    async exec(){commands++;return{exitCode:1};}};
  assert.equal(await projectRuntimeProcessRunning(runtime,'owned-session',{processId:'owned-process',pid:123}),true);
  assert.equal(commands,0);
});
test('negative and denied native status cannot fall back to a command',async()=>{
  let commands=0;
  const runtime={async probeProcess(){return false;},async exec(){commands++;return{exitCode:0};}};
  assert.equal(await projectRuntimeProcessRunning(runtime,'s',{processId:'p',pid:123}),false);
  runtime.probeProcess=async()=>{throw new Error('AUTHORITY_DENIED');};
  await assert.rejects(projectRuntimeProcessRunning(runtime,'s',{processId:'p',pid:123}),/AUTHORITY_DENIED/);
  assert.equal(commands,0);
});
test('providers without a native probe retain their existing bounded process check',async()=>{
  const runtime={async probeProcess(){return null;},async exec(session:string,input:unknown){
    assert.equal(session,'s');assert.deepEqual(input,{command:'kill',args:['-0','123'],networkPolicy:'none',timeoutMs:5000});return{exitCode:0};}};
  assert.equal(await projectRuntimeProcessRunning(runtime,'s',{processId:'p',pid:123}),true);
});
