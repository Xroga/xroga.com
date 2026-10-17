import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GrowthService } from './growthService.js';

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
  const db={from(table:string){let mutation='';const filters:Record<string,unknown>={};let patch:Record<string,unknown>={};
    const q={select(){return q;},eq(k:string,v:unknown){filters[k]=v;return q;},insert(){mutation='insert';return q;},update(value:Record<string,unknown>){mutation='update';patch=value;writes++;return q;},
      async maybeSingle(){return{error:null,data:table==='projects'?{id:'project',user_id:'actor'}:table==='profiles'?{role:'member'}:{id:'segment'}};},
      then(resolve:(v:unknown)=>unknown){assert.equal(table,'growth_campaigns');
        if(mutation==='insert')return Promise.resolve(resolve({data:[campaign],error:null}));
        assert.deepEqual(filters,{id:'campaign',tenant_id:'actor',project_id:'project',version:1,status:'approval_required'});
        return Promise.resolve(resolve({error:outcome==='error'?{message:'secret'}:null,data:outcome==='empty'?[]:[{...campaign,...patch,...(outcome==='wrongReceipt'?{evidence_reference:'wrong'}:{})}]}));}};return q;}};
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
});
