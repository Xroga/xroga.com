import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {goalContractSchema} from '../ai/universal/goalContract.js';
import {createBuildContract} from '../synthesis/buildContract.js';
import {deriveProjectRunState} from '../synthesis/projectRunState.js';
import {createSoftwareProject} from '../synthesis/softwareProject.js';
import {SupabaseProjectRuntimeStore} from '../synthesis/projectRuntime/store.js';
import {loadProjectDelivery} from '../synthesis/delivery/projectDeliveryService.js';

type Actor={id:string;token:string};
type Request=(path:string,token?:string,method?:string,body?:unknown)=>Promise<Response>;
/** Fictional persisted event fixtures prove ownership, never provider deployment. */
export function registerDeliveryEvidenceReadTests(admin:SupabaseClient,request:Request):void{
 test('real delivery evidence endpoint uses verified owner and project before exposing persisted publication or deployment metadata',async t=>{
  assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
  const actors:Actor[]=[],store=new SupabaseProjectRuntimeStore(),projectId=`delivery-fixture-${randomUUID()}`,privateProject=`delivery-private-${randomUUID()}`,projects=[projectId,privateProject],revisionIds:string[]=[],original=globalThis.fetch;
  t.after(async()=>{globalThis.fetch=original;for(const actor of actors)assert.equal((await admin.auth.admin.deleteUser(actor.id)).error,null);});
  for(let n=0;n<2;n++){const email=`delivery-owner-${randomUUID()}@example.invalid`,password=randomUUID()+randomUUID(),created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(created.error,null);assert.ok(created.data.user);const client:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});const signed=await client.auth.signInWithPassword({email,password});assert.equal(signed.error,null);assert.ok(signed.data.session);actors.push({id:created.data.user.id,token:signed.data.session.access_token});}
  const [owner,other]=actors;
  const goal=goalContractSchema.parse({version:'1.0',goal:'Build a fictional project',desiredOutcome:'A local fixture',semanticIntent:'MODIFY',previewRequirement:'PREFERRED',publicationRequirement:'NONE',deploymentRequirement:'NONE',confidence:1});
  const seed=async(userId:string,id:string,marker:string)=>{
   const contract=createBuildContract({projectId:id,runId:randomUUID(),sourcePrompt:'Synthetic delivery fixture',goal,existingFileCount:0}),files=[{path:'index.txt',content:marker}];
   const lifecycle=deriveProjectRunState({outcome:'completed',phaseReached:'complete',verified:true,fileCount:1,commitSha:null,reason:'Synthetic fixture',blockers:[],publicationRequested:false,publicationStatus:'not_requested',deploymentRequested:false});
   const project=createSoftwareProject({contract,files,fileTrail:[],lifecycle,verified:true,reason:'Synthetic fixture',blockers:[],repository:null});
   const saved=await store.saveRevision(userId,project);revisionIds.push(saved.revisionId);return saved;
  };
  const own=await seed(owner.id,projectId,'DELIVERY_OWNER_A'),foreign=await seed(other.id,projectId,'DELIVERY_OWNER_B');await seed(owner.id,privateProject,'DELIVERY_PRIVATE_A');
  for(const [i,actor]of [owner,other].entries()){
   await store.appendEvent({userId:actor.id,projectId,sessionId:null,eventType:'publication.completed',payload:{repository:`fixture/DELIVERY_OWNER_${i?'B':'A'}`,repoUrl:`https://example.invalid/fixture-${i}`,branch:'fixture',commitSha:`synthetic-${i}`}});
   await store.appendEvent({userId:actor.id,projectId,sessionId:null,eventType:'deployment.ready',payload:{deploymentId:`synthetic-${i}`,url:`https://example.invalid/deployment-${i}`,verified:false}});
  }
  const snapshot=async()=>{const events=await admin.from('project_runtime_events').select('*').in('project_id',projects).in('user_id',[owner.id,other.id]).order('event_id'),revisions=await admin.from('project_runtime_revisions').select('*').in('revision_id',revisionIds).order('revision_id');assert.equal(events.error,null);assert.equal(revisions.error,null);return{events:events.data,revisions:revisions.data};};const before=await snapshot();
  for(const [i,actor]of [owner,other].entries()){
   const response=await request(`/api/delivery/${projectId}?userId=${i?owner.id:other.id}&tenantId=${i?owner.id:other.id}`,actor.token);assert.equal(response.status,200);
   const result=await response.json() as {revision:{revisionId:string};evidence:{publication:{repository:string};deployment:{deploymentId:string;verified:boolean}}};assert.equal(result.revision.revisionId,i?foreign.revisionId:own.revisionId);assert.equal(result.evidence.publication.repository,`fixture/DELIVERY_OWNER_${i?'B':'A'}`);assert.equal(result.evidence.deployment.deploymentId,`synthetic-${i}`);assert.equal(result.evidence.deployment.verified,false);
  }
  assert.equal((await request(`/api/delivery/${projectId}`)).status,401);assert.equal((await request(`/api/delivery/${privateProject}?userId=${owner.id}`,other.token)).status,404);assert.equal((await request(`/api/delivery/${privateProject}`,owner.token)).status,200);
  globalThis.fetch=async(input,init)=>{const url=new URL(String(input instanceof globalThis.Request?input.url:input));assert.equal(url.origin,'http://127.0.0.1:54321');if(url.pathname==='/rest/v1/project_runtime_events')return Response.json({message:'SYNTHETIC_UNAVAILABLE_DELIVERY_AUTHORITY'},{status:503});return original(input,init);};await assert.rejects(loadProjectDelivery(owner.id,projectId));globalThis.fetch=original;
  assert.deepEqual(await snapshot(),before);
 });
}
