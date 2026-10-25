import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {SupabaseClient} from '@supabase/supabase-js';
import {GrowthService} from './growthService.js';

test('remaining growth writes cannot persist after their preflight authority is revoked',async()=>{
  for(const operation of ['recommend','suppress','attribution','segment','experiment']){
    let revoked=false,writes=0;
    const db={from(table:string){
      const q={select(){return q;},eq(){return q;},not(){return q;},order(){return q;},limit(){return q;},
        insert(value:unknown){writes++;return q;},upsert(value:unknown){writes++;return q;},
        async maybeSingle(){
          if(table==='projects')return{data:{id:'project',user_id:'owner'},error:null};
          if(table==='profiles')return{data:{role:'member'},error:null};
          if(table==='operations_memberships'){revoked=true;return{data:{role:'operator'},error:null};}
          return{data:null,error:null};
        },then(resolve:(value:unknown)=>unknown){return Promise.resolve(resolve({data:[],error:null}));},
      };return q;
    },async rpc(){assert.equal(revoked,true);return{data:null,error:{code:'42501'}};}};
    const service=new GrowthService(db as unknown as SupabaseClient);
    const invoke=operation==='recommend'?()=>service.recommend('actor',{projectId:'project',consent:true}):
      operation==='suppress'?()=>service.suppress('actor',{projectId:'project',channel:'in_app',address:'fixture',reason:'manual',evidenceReference:'fixture'}):
      operation==='attribution'?()=>service.recordAttribution('actor',{projectId:'project',touchType:'unknown',evidenceReference:'fixture'}):
      operation==='segment'?()=>service.createSegment('actor',{projectId:'project',name:'fixture',lifecycleStates:['activated']}):
      ()=>service.createExperiment('actor',{projectId:'project',key:'fixture',seed:'fixture',variants:[{key:'control',weight:1}],minimumSampleSize:1});
    await assert.rejects(invoke(),{code:'forbidden'},`${operation} must reach current-authority transaction admission`);
    assert.equal(writes,0,'No direct mutation may follow the stale preflight');
  }
});

test('all admitted growth operations verify exact owner parent and submitted persistence receipts',async()=>{
 let mode='own';
 const db={from(table:string){const q={select(){return q;},eq(){return q;},not(){return q;},order(){return q;},limit(){return q;},async maybeSingle(){return{data:table==='projects'?{id:'project',user_id:'owner'}:table==='profiles'?{role:'member'}:null,error:null};},then(resolve:(v:unknown)=>unknown){return Promise.resolve(resolve({data:[],error:null}));}};return q;},
 async rpc(name:string,args:Record<string,unknown>){
  assert.equal(name,'write_growth_record_admitted');assert.equal(args.p_actor,'owner');assert.equal(args.p_tenant,'owner');assert.equal(args.p_project,'project');
  const record=args.p_data as Record<string,unknown>,row={id:'generated',tenant_id:'owner',project_id:'project',...record};
  if(mode==='foreign-owner')row.tenant_id='other';if(mode==='foreign-project')row.project_id='other';
  if(mode==='changed')Object.assign(row,{[Object.keys(record)[0]]:'altered'});
  return{data:mode==='missing'?null:row,error:mode==='error'?{code:'XX000'}:null};
 }};
 const service=new GrowthService(db as unknown as SupabaseClient);
 const calls=[()=>service.recommend('owner',{projectId:'project',consent:true}),()=>service.suppress('owner',{projectId:'project',channel:'in_app',address:'fixture',reason:'manual',evidenceReference:'fixture'}),()=>service.recordAttribution('owner',{projectId:'project',touchType:'unknown',evidenceReference:'fixture'}),()=>service.createSegment('owner',{projectId:'project',name:'fixture',lifecycleStates:['activated']}),()=>service.createExperiment('owner',{projectId:'project',key:'fixture',seed:'fixture',variants:[{key:'control',weight:1}],minimumSampleSize:1})];
 for(const call of calls){mode='own';assert.equal((await call()).id,'generated');for(mode of ['foreign-owner','foreign-project','changed','missing','error'])await assert.rejects(call(),{code:'storage_unavailable'});}
 mode='own';const suppression=await calls[1]();assert.ok(!('tenant_id'in suppression));assert.ok(!('address_hash'in suppression));
});

test('pending campaign creation cannot attempt a direct write after revoked preflight authority',async()=>{
 let writes=0;
 const db={from(table:string){const q={select(){return q;},eq(){return q;},insert(){writes++;throw new Error('stale direct campaign insert');},async maybeSingle(){return{data:table==='projects'?{id:'project',user_id:'owner'}:table==='profiles'?{role:'member'}:table==='operations_memberships'?{role:'operator'}:table==='growth_segments'?{id:'segment'}:null,error:null};},then(resolve:(v:unknown)=>unknown){return Promise.resolve(resolve({data:[],error:null}));}};return q;},async rpc(){return{data:null,error:{code:'42501'}};}};
 const service=new GrowthService(db as unknown as SupabaseClient);
 await assert.rejects(service.createCampaign('actor',{projectId:'project',segmentId:'segment',name:'fixture',channel:'in_app',templateKey:'fixture',idempotencyKey:'fixture'}),{code:'forbidden'});
 assert.equal(writes,0);
});
