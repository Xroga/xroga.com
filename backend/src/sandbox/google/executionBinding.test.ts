import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {createRunDurable,withRunAttempt} from '../../ai/runStore.js';
import {createCanonicalExecutionState} from '../../ai/executionRuntime.js';
import {createAgentEvidence} from '../../ai/softwareAgent/createAgentEvidence.js';
import {softwareAgentBaseFingerprint,type SoftwareAgentCheckpoint} from '../../ai/softwareAgent/softwareAgentCheckpoint.js';
import {issueSandboxExecutionBinding,requireSandboxExecutionBinding,sandboxSourceMatches} from './executionBinding.js';
import {DEFAULT_SANDBOX_LIMITS,SandboxAdmissionError,type SandboxExecutionRequest} from '../sandboxTypes.js';

test('native binding requires a real canonical scope, owned durable source and original issued object',async()=>{
  const keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','NODE_ENV'];const prior=keys.map(key=>process.env[key]);const originalFetch=globalThis.fetch;
  const owner=randomUUID(),run=randomUUID(),project=randomUUID();let row:Record<string,unknown>={};let projectOwned=true;
  const state=createCanonicalExecutionState({projectId:'logical-project',databaseProjectId:project,runId:run,tasks:[]});
  state.currentWorkingSnapshot=[{path:'index.ts',content:'owned-source'}];
  const request:SandboxExecutionRequest={files:[...state.currentWorkingSnapshot],command:'node',args:['--version'],timeoutMs:10000,
    networkPolicy:'none',environment:{CI:'1'},limits:{...DEFAULT_SANDBOX_LIMITS}};
  let reads=0;process.env.SUPABASE_URL='http://127.0.0.1:49230';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-only';process.env.NODE_ENV='production';
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input));
    if(url.pathname==='/rest/v1/swarm_runs'&&init?.method==='POST'){row=JSON.parse(String(init.body));return new Response(null,{status:201});}
    reads++;assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
    if(url.pathname==='/rest/v1/swarm_runs')return Response.json(row);
    if(url.pathname==='/rest/v1/projects')return Response.json(projectOwned?{id:project}:null);
    assert.equal(url.pathname,'/rest/v1/execution_runs');
    return Response.json({user_id:owner,run_id:run,project_id:state.projectId,repository_identity:state.repository,
      selected_branch:state.selectedBranch,starting_commit_sha:state.startingCommitSha,state});
  };
  try{
    await assert.rejects(issueSandboxExecutionBinding('compile-validator',request),SandboxAdmissionError);assert.equal(reads,0);
    await withRunAttempt(async()=>{
      await createRunDurable(owner,'Synthetic source binding',run,project);
      await assert.rejects(issueSandboxExecutionBinding('compile-validator',{...request,files:[{path:'index.ts',content:'foreign-source'}]}),SandboxAdmissionError);
      const binding=await issueSandboxExecutionBinding('compile-validator',request);const bound={...request,executionBinding:binding};
      assert.equal(await requireSandboxExecutionBinding(bound),binding);
      const before=reads;
      await assert.rejects(requireSandboxExecutionBinding({...bound,executionBinding:structuredClone(binding)}),SandboxAdmissionError);
      await assert.rejects(requireSandboxExecutionBinding({...bound,command:'sh'}),SandboxAdmissionError);assert.equal(reads,before);
      projectOwned=false;await assert.rejects(requireSandboxExecutionBinding(bound),SandboxAdmissionError);projectOwned=true;
      row={...row,status:'cancelled'};await assert.rejects(requireSandboxExecutionBinding(bound),SandboxAdmissionError);
      assert.equal(await requireSandboxExecutionBinding(bound,true),binding,'previously issued authority permits owned cleanup only');
    });
  }finally{globalThis.fetch=originalFetch;keys.forEach((key,index)=>{if(prior[index]===undefined)delete process.env[key];else process.env[key]=prior[index];});}
});

test('SoftwareAgent source must match the owned base or its lineage-bound durable delta',()=>{
  const state=createCanonicalExecutionState({projectId:'logical',runId:'synthetic-run',tasks:[]});state.currentWorkingSnapshot=[{path:'index.ts',content:'base'}];
  const checkpoint:SoftwareAgentCheckpoint={schemaVersion:'1.0.0',runId:state.runId,projectId:null,repository:null,
    baseFingerprint:softwareAgentBaseFingerprint(state.currentWorkingSnapshot),changes:[{path:'index.ts',kind:'modified',content:'owned-delta'}],
    evidence:createAgentEvidence(),status:'active',blockers:[],failureCode:null,updatedAt:new Date().toISOString()};
  const source=[{path:'index.ts',content:'owned-delta'}];
  assert.equal(sandboxSourceMatches('software-agent-command',source,state,checkpoint),true);
  for(const changed of [{runId:'foreign'},{projectId:'foreign'},{baseFingerprint:'foreign'},{repository:{owner:'foreign',repo:'foreign',branch:'main'}}])
    assert.equal(sandboxSourceMatches('software-agent-command',source,state,{...checkpoint,...changed}),false);
  assert.equal(sandboxSourceMatches('compile-validator',source,state,checkpoint),false);
  assert.equal(sandboxSourceMatches('software-agent-command',[{path:'index.ts',content:'unowned'}],state,checkpoint),false);
});
