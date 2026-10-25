/** Real pipeline control flow with synthetic transport. Not a database proof. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {runBuildPipeline} from '../ai/pipeline.js';
import {createCanonicalExecutionState} from '../ai/executionRuntime.js';
import {createTenantContext} from './tenantContext.js';
import {getRun,withRunAttempt} from '../ai/runStore.js';

for(const resume of [false,true])test(`pipeline ${resume?'resume':'create'} carries its original project to decisive admission after ownership changes during a wait`,async t=>{
  const userId='11111111-1111-4111-8111-111111111111',projectId='33333333-3333-4333-8333-333333333333',runId=randomUUID();
  const original=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY,oldMode=process.env.NODE_ENV;
  process.env.SUPABASE_URL='https://worker-admission.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-only';process.env.NODE_ENV='test';
  t.after(()=>{globalThis.fetch=original;oldUrl===undefined?delete process.env.SUPABASE_URL:process.env.SUPABASE_URL=oldUrl;oldKey===undefined?delete process.env.SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;oldMode===undefined?delete process.env.NODE_ENV:process.env.NODE_ENV=oldMode;});
  let currentOwner=true,waitObserved=false;const proposals:Record<string,unknown>[]=[];
  const state=createCanonicalExecutionState({runId,projectId,databaseProjectId:projectId});
  globalThis.fetch=async(input,init)=>{
    const request=input instanceof Request?input:null,url=new URL(String(request?request.url:input));
    assert.equal(url.origin,'https://worker-admission.invalid','No provider or other network call is authorized');
    const method=init?.method??request?.method??'GET';
    if(method!=='GET'&&method!=='HEAD'){
      assert.equal(url.pathname,'/rest/v1/swarm_runs');proposals.push(JSON.parse(String(init?.body)));
      return Response.json({code:'42501',message:'Synthetic current project denial'},{status:403});
    }
    if(url.pathname==='/rest/v1/projects')return Response.json(currentOwner?[{id:projectId}]:[]);
    if(url.pathname==='/rest/v1/execution_runs')return Response.json([{run_id:runId,user_id:userId,project_id:projectId,state,repository_identity:null,selected_branch:state.selectedBranch,starting_commit_sha:null}]);
    if(url.pathname==='/rest/v1/github_integrations'||(resume&&url.pathname==='/rest/v1/swarm_runs')){
      currentOwner=false;waitObserved=true;
      if(resume)return Response.json([{id:runId,user_id:userId,project_id:projectId,status:'error',prompt:'Synthetic retained prompt',iteration_count:0,last_sequence:0,created_at:new Date().toISOString(),completed_at:new Date().toISOString(),lease_generation:randomUUID()}]);
    }
    return Response.json([]);
  };
  await assert.rejects(withRunAttempt(()=>runBuildPipeline({userId,tenantContext:createTenantContext({userId,via:'remote_getuser'}),
    runId,projectId,prompt:'Synthetic admission only',clientMeta:resume?{resumeRun:true}:{buildUpdate:true}})),{status:404});
  assert.equal(waitObserved,true);assert.equal(proposals.length,1);
  assert.equal(proposals[0]!.project_id,projectId,'The database must receive the originally selected project, not merely a user and run ID');
  if(!resume)assert.equal(proposals[0]!.user_id,userId);
  assert.equal(getRun(runId),null,'Failed admission cannot leave an active local worker');
});
