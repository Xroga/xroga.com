import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {SupabaseClient} from '@supabase/supabase-js';
import {GrowthService} from './growthService.js';

test('growth replay binds normalized actor intent, verifies receipts and resolves concurrent duplicate insert',async()=>{
 let stored:Record<string,unknown>|null=null,mode='create',reads=0,writes=0;
 const db={from(table:string){let payload:Record<string,unknown>={};const q={
  select(){return q;},eq(){return q;},insert(row:Record<string,unknown>){payload=row;writes++;return q;},
  async maybeSingle(){if(table==='projects')return{data:{id:'project',user_id:'actor'},error:null};if(table==='profiles')return{data:{role:'member'},error:null};reads++;return{data:mode==='race'&&reads===1?null:stored,error:null};},
  then(resolve:(v:unknown)=>unknown){if(mode==='race')return Promise.resolve(resolve({error:{code:'23505'},data:null}));
   stored={id:'event',...payload};return Promise.resolve(resolve({error:mode==='outage'?{code:'XX000'}:null,data:mode==='bad-receipt'?[{...stored,user_id:'foreign'}]:[stored]}));}
 };return q;}};
 const service=new GrowthService(db as unknown as SupabaseClient);
 const input={projectId:'project',name:'identity.linked.v1',idempotencyKey:'key',environment:'test' as const,consentState:'granted' as const,source:'fixture',evidenceReference:'proof',metadata:{a:1,b:2},occurredAt:'2026-01-01T00:00:00.000Z'};
 const created=await service.recordEvent('actor',input);assert.equal(created.duplicate,false);
 assert.equal((await service.recordEvent('actor',{...input,metadata:{b:2,a:1},occurredAt:'2026-01-01T00:00:00Z'})).duplicate,true);
 const winner=stored!;
 for(const field of ['user_id','project_id','tenant_id','event_type','environment','consent_state','source','evidence_reference','anonymous_id','session_id','campaign_id','referral_id','experiment_id','deployment_id','release_id','metadata','occurred_at']){
  stored={...winner,[field]:'changed'};await assert.rejects(service.recordEvent('actor',input),{code:'idempotency_conflict',statusCode:409});
 }
 assert.equal(writes,1);
 stored=winner;mode='race';reads=0;const concurrent=await service.recordEvent('actor',input);assert.equal(concurrent.duplicate,true);assert.equal(concurrent.event.id,'event');assert.equal(writes,2);
 for(mode of ['bad-receipt','outage']){stored=null;await assert.rejects(service.recordEvent('actor',input),{code:'storage_unavailable',statusCode:503});}
});

test('growth event snapshots nested metadata before authority awaits',async()=>{
 let enter!:()=>void,release!:()=>void,payload:Record<string,unknown>={};const started=new Promise<void>(r=>enter=r),gate=new Promise<void>(r=>release=r);
 const db={from(table:string){const q={select(){return q;},eq(){return q;},insert(row:Record<string,unknown>){payload=row;return q;},
  async maybeSingle(){if(table==='projects'){enter();await gate;return{data:{id:'project',user_id:'actor'},error:null};}return{data:table==='profiles'?{role:'member'}:null,error:null};},
  then(resolve:(v:unknown)=>unknown){return Promise.resolve(resolve({data:[{id:'event',...payload}],error:null}));}
 };return q;}};
 const input={projectId:'project',name:'identity.linked.v1',idempotencyKey:'key',environment:'test' as const,consentState:'granted' as const,source:'fixture',evidenceReference:'proof',metadata:{nested:{value:'original'}}};
 const pending=new GrowthService(db as unknown as SupabaseClient).recordEvent('actor',input);await started;input.projectId='other';input.metadata.nested.value='changed';release();
 const result=await pending;assert.equal(result.event.project_id,'project');assert.deepEqual(result.event.metadata,{nested:{value:'original'}});
});
