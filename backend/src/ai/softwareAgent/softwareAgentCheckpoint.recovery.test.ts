import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {bindSoftwareCheckpointRecovery,softwareAgentBaseFingerprint,SupabaseSoftwareAgentCheckpointStore,workingFilesFromCheckpoint,type SoftwareAgentCheckpoint} from './softwareAgentCheckpoint.js';
import {createAgentEvidence} from './createAgentEvidence.js';
import {SoftwareAgentService} from './SoftwareAgentService.js';
import {AgentSoftwareExecutor} from './AgentSoftwareExecutor.js';
import type {SoftwareExecutionContract} from './contracts.js';

const baseFiles=[{path:'a.txt',content:'original'}];
function fixture(){
  const owner=randomUUID(),runId=randomUUID();
  const checkpoint:SoftwareAgentCheckpoint={schemaVersion:'1.0.0',runId,projectId:'project',repository:null,baseFingerprint:softwareAgentBaseFingerprint(baseFiles),
    changes:[{path:'a.txt',kind:'modified',content:'authorized'}],evidence:createAgentEvidence(),status:'active',blockers:[],failureCode:null,updatedAt:new Date().toISOString()};
  const row={run_id:runId,user_id:owner,project_id:'project',repository_identity:null,base_fingerprint:checkpoint.baseFingerprint,status:checkpoint.status,checkpoint};
  return{owner,runId,checkpoint,row};
}
test('actual checkpoint loader binds owner row and embedded recovery identity without requiring legacy generation',async()=>{
  const f=fixture(),prior=[process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY],originalFetch=globalThis.fetch;
  process.env.SUPABASE_URL='http://127.0.0.1:49227';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-only';let row:unknown=f.row;
  globalThis.fetch=async(input)=>{const url=new URL(String(input));assert.equal(url.pathname,'/rest/v1/software_agent_checkpoints');assert.equal(url.searchParams.get('user_id'),`eq.${f.owner}`);assert.equal(url.searchParams.get('run_id'),`eq.${f.runId}`);return Response.json(row);};
  try{
    const store=new SupabaseSoftwareAgentCheckpointStore(f.owner);
    assert.deepEqual(await store.load(f.runId),f.checkpoint,'safe legacy read needs no worker descriptor');
    for(const patch of [{user_id:randomUUID()},{run_id:randomUUID()},{project_id:'foreign'},{base_fingerprint:'foreign'},{status:'verified'},
      {repository_identity:{owner:'foreign',repo:'r',branch:'main'}},{checkpoint:{...f.checkpoint,runId:randomUUID()}},
      {checkpoint:{...f.checkpoint,changes:[{path:'a.txt',kind:'modified'}]}},{checkpoint:{...f.checkpoint,evidence:null}}]){
      row={...f.row,...patch};assert.equal(await store.load(f.runId),null);
    }
  }finally{globalThis.fetch=originalFetch;['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'].forEach((key,index)=>{if(prior[index]===undefined)delete process.env[key];else process.env[key]=prior[index];});}
});

test('shared recovery wrapper protects preview reconstruction and actual service from same-owner foreign lineage',async t=>{
  const f=fixture();let candidate=f.checkpoint;const saved:SoftwareAgentCheckpoint[]=[];
  const expected={runId:f.runId,projectId:'project',repository:null,baseFiles:structuredClone(baseFiles)};
  const store=bindSoftwareCheckpointRecovery({load:async()=>candidate,save:async value=>{saved.push(value);}},expected);
  expected.projectId='mutated';expected.baseFiles[0].content='mutated';
  const valid=await store.load(f.runId);assert.ok(valid);assert.equal(workingFilesFromCheckpoint(baseFiles,valid)[0].content,'authorized');
  assert.equal(await store.load(randomUUID()),null);
  for(const patch of [{runId:randomUUID()},{projectId:'foreign'},{repository:{owner:'o',repo:'r',branch:'main'}},{baseFingerprint:'foreign'}]){
    candidate={...f.checkpoint,...patch};assert.equal(await store.load(f.runId),null);
  }
  const contract:SoftwareExecutionContract={runId:f.runId,projectId:'project',taskKind:'cli',goal:'Synthetic test',writePolicy:{allowedPaths:['**'],deniedPaths:[],allowCreate:true,allowDelete:false,allowRename:false},
    preview:'not_applicable',verificationAuthority:'universal',persistence:'none',deployment:'forbidden',acceptanceCriteria:[],constraints:[]};
  const stop=new Error('Reached synthetic executor'),executor=new AgentSoftwareExecutor();t.mock.method(executor,'execute',async()=>{throw stop;});
  const forbidden=async()=>{throw new Error('Unexpected provider');};
  await assert.rejects(new SoftwareAgentService(executor).execute({contract,model:{routeId:'synthetic'},events:{emit:async()=>{}},initialFiles:baseFiles,checkpointStore:store,
    bindings:{userId:f.owner,runSandboxCommand:forbidden,runProjectChecks:forbidden,verifyProjectPreview:forbidden,createReviewBranch:forbidden}}),error=>error===stop);
  assert.deepEqual(saved[0].changes,[],'service did not restore unverified checkpoint delta');
  const adapter=readFileSync(new URL('../../synthesis/softwareAgentImplementationAdapter.ts',import.meta.url),'utf8');
  assert.match(adapter,/const checkpointStore = bindSoftwareCheckpointRecovery\(checkpointStoreFor\(input\)/);
  assert.ok(adapter.indexOf('checkpointStore,',adapter.indexOf('createAgentLivePreviewBridge({'))>0);
});
