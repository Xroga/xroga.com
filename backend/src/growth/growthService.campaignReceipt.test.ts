import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GrowthService } from './growthService.js';
import { OperationsServiceError } from '../operations/operationsService.js';

test('growth retains the owner authorized by operations instead of rereading a changed project owner',async()=>{
  let projectReads=0;
  const db={from(table:string){const filters:Record<string,unknown>={};const q={select(){return q;},eq(k:string,v:unknown){filters[k]=v;return q;},order(){return q;},limit(){return q;},
    async maybeSingle(){if(table==='projects'){projectReads++;return{data:{id:'project',user_id:projectReads===1?'actor':'foreign'},error:null};}return{data:{role:'member'},error:null};},
    then(resolve:(v:unknown)=>unknown){assert.equal(filters.tenant_id,'actor');assert.equal(filters.project_id,'project');return Promise.resolve(resolve({data:[],error:null}));}};return q;}};
  await new GrowthService(db as unknown as SupabaseClient).overview('actor','project');assert.equal(projectReads,1);
});

test('campaign action binding and acknowledgement fail closed without fabricated evidence',async()=>{
  let outcome='valid',writes=0;
  const campaign={id:'campaign',tenant_id:'actor',project_id:'project',segment_id:'segment',channel:'in_app',status:'approval_required',version:1,name:'Campaign',template_key:'fixture',consent_required:true};
  const db={from(table:string){
    const q={select(){return q;},eq(){return q;},
      async maybeSingle(){return{error:null,data:table==='projects'?{id:'project',user_id:'actor'}:table==='profiles'?{role:'member'}:{id:'segment'}};}};return q;},
    async rpc(name:string,args:Record<string,unknown>){
      assert.equal(name,'write_growth_record_admitted');assert.equal(args.p_actor,'actor');assert.equal(args.p_tenant,'actor');assert.equal(args.p_project,'project');
      const data=args.p_data as Record<string,unknown>;
      if(args.p_operation==='campaign_create'){
        assert.deepEqual(data,{segment_id:'segment',name:'Campaign',channel:'in_app',status:'approval_required',template_key:'fixture',consent_required:true});
        return{data:{...campaign,...(outcome.startsWith('createWrong:')?{[outcome.slice(12)]:'foreign'}:{})},error:null};
      }
      assert.equal(args.p_operation,'campaign_link');assert.deepEqual(data,{...campaign,action_id:'action',action_key:'key'});writes++;
      return{error:outcome==='error'?{message:'secret'}:null,data:outcome==='empty'?null:{...campaign,approval_id:null,evidence_reference:outcome==='wrongReceipt'?'wrong':'operations_action:action'}};
    }};
  const service=new GrowthService(db as unknown as SupabaseClient);
  const operations=(service as unknown as {operations:{createAction:(actor:string,input:Record<string,unknown>)=>Promise<Record<string,unknown>>}}).operations;
  operations.createAction=async()=>({id:'action',user_id:'actor',project_id:'project',requested_by:'actor',action_type:'execute_growth_campaign',target_type:'growth_campaign',target_id:'campaign',target_version:1,idempotency_key:'key',
    ...(outcome.startsWith('wrong:')?{[outcome.slice(6)]:outcome==='wrong:target_version'?2:'foreign'}:{})});
  const input={projectId:'project',segmentId:'segment',name:'Campaign',channel:'in_app' as const,templateKey:'fixture',idempotencyKey:'key'};
  assert.equal((await service.createCampaign('actor',input)).campaign.evidence_reference,'operations_action:action');
  for(const key of ['user_id','project_id','requested_by','action_type','target_type','target_id','target_version','idempotency_key']){
    outcome=`wrong:${key}`;const before=writes;await assert.rejects(service.createCampaign('actor',input),{code:'idempotency_conflict',statusCode:409});assert.equal(writes,before);
  }
  for(const bad of ['empty','error','wrongReceipt']){outcome=bad;await assert.rejects(service.createCampaign('actor',input),{code:'storage_unavailable',statusCode:503});}
  for(const key of ['tenant_id','project_id','segment_id','name','channel','status','template_key']){outcome=`createWrong:${key}`;const before=writes;await assert.rejects(service.createCampaign('actor',input),{code:'storage_unavailable'});assert.equal(writes,before);}
  outcome='valid';for (const error of [new OperationsServiceError('conflict','fixture',409), new OperationsServiceError('unknown','fixture',503), new Error('unrelated')]) {
    operations.createAction=async()=>{throw error;};const before=writes;
    await assert.rejects(service.createCampaign('actor',input), error instanceof OperationsServiceError && error.code==='conflict'
      ? {code:'idempotency_conflict',statusCode:409} : value=>value===error);
    assert.equal(writes,before,'failed action cannot link campaign evidence');
  }
});
