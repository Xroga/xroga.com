import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {Agent} from '@cline/sdk';
import {SoftwareAgentService} from './SoftwareAgentService.js';
import type {SoftwareExecutionContract} from './contracts.js';
import {SandboxAdmissionError} from '../../sandbox/sandboxTypes.js';

for(const toolName of ['run_command','run_checks','verify_preview'])test(`${toolName} native admission denial aborts the SDK and cannot become another model/tool attempt`,async t=>{
  const contract:SoftwareExecutionContract={runId:randomUUID(),projectId:'synthetic-project',taskKind:'web_app',goal:'Synthetic admission fixture',
    writePolicy:{allowedPaths:['**'],deniedPaths:[],allowCreate:true,allowDelete:false,allowRename:false},preview:'required',
    verificationAuthority:'agent',persistence:'none',deployment:'forbidden',acceptanceCriteria:[],constraints:[]};
  let calls=0,aborts=0,runs=0;const denial=new SandboxAdmissionError();
  const denied=async()=>{calls++;throw denial;};
  t.mock.method(Agent.prototype,'abort',()=>{aborts++;});
  t.mock.method(Agent.prototype,'run',async function(this:Agent){
    runs++;const tool=(this as unknown as {config:{tools:{name:string;execute:(input:unknown)=>Promise<unknown>}[]}}).config.tools.find(tool=>tool.name===toolName);
    assert.ok(tool);
    // The SDK may convert thrown tool errors to messages. The executor must
    // retain a fatal admission latch even if that channel swallows the throw.
    try{await tool.execute(toolName==='run_command'?{command:'node --version'}:{});}catch{}
    return {status:'completed',outputText:'Not authoritative',iterations:1};
  });
  await assert.rejects(new SoftwareAgentService().execute({contract,model:{routeId:'synthetic',model:{} as never},
    events:{emit:async()=>{}},initialFiles:[{path:'index.html',content:'synthetic'}],
    bindings:{userId:randomUUID(),runSandboxCommand:denied,runProjectChecks:denied,verifyProjectPreview:denied,createReviewBranch:denied},
    checkpointStore:{load:async()=>null,save:async()=>{}}}),error=>error===denial);
  assert.equal(calls,1);assert.equal(aborts,1);assert.equal(runs,1);
});
