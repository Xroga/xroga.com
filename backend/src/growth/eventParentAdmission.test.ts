import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {SupabaseClient} from '@supabase/supabase-js';
import {GrowthService} from './growthService.js';

test('event creation and replay cannot use an owner snapshot invalidated after preflight',async()=>{
  for(const replay of [false,true]){
    let writes=0,currentOwner='actor';
    const event={id:'event',tenant_id:'actor',user_id:'actor',project_id:'project',event_type:'identity.linked.v1',event_version:1,
      idempotency_key:'key',environment:'test',anonymous_id:null,session_id:null,release_id:null,deployment_id:null,
      campaign_id:null,referral_id:null,experiment_id:null,consent_state:'granted',source:'fixture',evidence_reference:'proof',metadata:{}};
    const db={from(table:string){const q={select(){return q;},eq(){return q;},
      async maybeSingle(){if(table==='projects'){currentOwner='foreign';return{data:{id:'project',user_id:'actor'},error:null};}
        return{data:table==='profiles'?{role:'member'}:replay?event:null,error:null};},
      insert(){writes++;return q;},then(resolve:(value:unknown)=>unknown){return Promise.resolve(resolve({data:[event],error:null}));}
    };return q;},async rpc(name:string,args:Record<string,unknown>){
      assert.equal(name,'record_growth_event');assert.equal(args.p_tenant,'actor');assert.equal(currentOwner,'foreign');
      return{data:null,error:{code:'42501',message:'PRIVATE_DATABASE_CANARY'}};
    }};
    await assert.rejects(new GrowthService(db as unknown as SupabaseClient).recordEvent('actor',{
      projectId:'project',name:'identity.linked.v1',idempotencyKey:'key',environment:'test',consentState:'granted',source:'fixture',evidenceReference:'proof',
    }),{code:'forbidden',statusCode:403});
    assert.equal(writes,0,'No independent service-role insert fallback');
  }
});

test('event RPC failures and substituted persistence receipts fail closed without leaking database errors',async()=>{
  let errorCode:string|undefined,change:(receipt:any)=>any=r=>r;
  const db={from(table:string){const q={select(){return q;},eq(){return q;},async maybeSingle(){
    return{data:table==='projects'?{id:'project',user_id:'actor'}:table==='profiles'?{role:'member'}:null,error:null};
  }};return q;},async rpc(name:string,args:Record<string,unknown>){
    assert.equal(name,'record_growth_event');assert.deepEqual(args.p_allowed_roles,['viewer','operator','release_manager','recovery_manager','admin']);
    return{data:change({duplicate:false,event:{id:'event',...(args.p_intent as object),tenant_id:args.p_tenant,occurred_at:'2026-01-01T00:00:00Z'}}),error:errorCode?{code:errorCode,message:'PRIVATE_DATABASE_CANARY'}:null};
  }};
  const service=new GrowthService(db as unknown as SupabaseClient),input={projectId:'project',name:'identity.linked.v1',idempotencyKey:'key',environment:'test' as const,consentState:'granted' as const,source:'fixture',evidenceReference:'proof'};
  for(const [code,status] of [['42501',403],['P0002',404],['23505',409],['22023',400],['XX000',503]] as const){
    errorCode=code;await assert.rejects(service.recordEvent('actor',input),error=>{
      assert.equal((error as any).statusCode,status);assert.ok(!(error as Error).message.includes('PRIVATE_DATABASE_CANARY'));return true;
    });
  }
  errorCode=undefined;
  for(change of [()=>null,r=>({...r,duplicate:'true'}),r=>({...r,event:{...r.event,tenant_id:'foreign'}}),r=>({...r,event:{...r.event,project_id:'foreign'}}),r=>({...r,event:{...r.event,user_id:'foreign'}}),r=>({...r,event:{...r.event,id:''}}),r=>({...r,event:{...r.event,occurred_at:'invalid'}})]){
    await assert.rejects(service.recordEvent('actor',input),{code:'storage_unavailable',statusCode:503});
  }
  change=r=>r;assert.equal((await service.recordEvent('actor',input)).event.user_id,'actor');
});
