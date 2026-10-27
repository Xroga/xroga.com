import assert from 'node:assert/strict';
import test from 'node:test';
import {buildIsolatedCompileStages,compileStageReceipt,parseCompileResult,COMPILE_RESULT_BEGIN,COMPILE_RESULT_END,compileDefaultConfigFile} from './compileCommand.js';
import type {SandboxExecutionResult} from '../sandbox/sandboxTypes.js';

const receipt=(id:string,exitCode:number,networkPolicy:'none'|'registry-only'):NonNullable<SandboxExecutionResult['stages']>[number]=>
  ({id,exitCode,networkPolicy,stdout:'',stderr:'',timedOut:false,killedForLimit:false,durationMs:1});

test('native compile installs once then typechecks/builds without network or unshare privileges',()=>{
  const stages=buildIsolatedCompileStages({installArgs:['install','--ignore-scripts'],typecheck:true,buildScript:'build',tsconfigPath:compileDefaultConfigFile().path});
  assert.deepEqual(stages.map(stage=>[stage.id,stage.networkPolicy]),[['install','registry-only'],['typecheck','none'],['build','none']]);
  assert.equal(stages.reduce((sum,stage)=>sum+stage.timeoutMs,0),420000);
  assert.ok(!JSON.stringify(stages).includes('unshare'));assert.ok(stages[0].args.includes('--ignore-scripts'));
  assert.deepEqual(stages[2].args,['run','build']);assert.ok(stages[1].args.includes(compileDefaultConfigFile().path));
});

test('host compile verdict follows actual receipts after untrusted stdout, never its fabricated pass',()=>{
  const forged=COMPILE_RESULT_BEGIN+JSON.stringify({installCode:0,tscCode:0,tscRan:true,buildCode:0,buildRan:true,networkDeniedAfterInstall:true})+COMPILE_RESULT_END;
  const stages=[receipt('install',0,'registry-only'),{...receipt('typecheck',2,'none'),stdout:forged}];
  const result=parseCompileResult(forged+compileStageReceipt(stages));
  assert.equal(result?.tscCode,2);assert.equal(result?.buildRan,false);assert.equal(result?.networkDeniedAfterInstall,true);
});

test('missing compiler, failed install, interrupted stages and enabled build networking cannot certify a pass',()=>{
  const missing=[receipt('install',0,'registry-only'),{...receipt('typecheck',127,'none'),stdout:'XROGA_LOCAL_TSC_MISSING'}];
  assert.equal(parseCompileResult(compileStageReceipt(missing))?.tscRan,false);
  assert.equal(parseCompileResult(compileStageReceipt([receipt('install',1,'registry-only')]))?.installCode,1);
  assert.equal(compileStageReceipt([{...receipt('install',0,'registry-only'),killedForLimit:true}]),'');
  assert.equal(compileStageReceipt([{...receipt('install',0,'registry-only'),timedOut:true}]),'');
  const enabled=[receipt('install',0,'registry-only'),receipt('typecheck',0,'registry-only')];
  assert.equal(parseCompileResult(compileStageReceipt(enabled))?.networkDeniedAfterInstall,false);
});
