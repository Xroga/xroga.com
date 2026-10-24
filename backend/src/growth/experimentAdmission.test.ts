import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GrowthService } from './growthService.js';

test('experiment assignment and exposure require owned exact receipts and preserve durable replay',async()=>{
  const now=new Date().toISOString();
  const experiment={id:'experiment',tenant_id:'owner',project_id:'project',allocation_seed:'seed',variants:[{key:'a',weight:1}]};
  const assignment={id:'assignment',experiment_id:'experiment',tenant_id:'owner',subject_key:'subject',variant:'a',assigned_at:now,exposed_at:null,evidence_reference:null};
  let returned:any={...assignment},replayed=false,error:string|null=null,shape='object',loaded:any={...assignment},calls=0;
  const db={from(table:string){const q={select(){return q;},eq(){return q;},async maybeSingle(){
    if(table==='projects')return {data:{id:'project',user_id:'owner'},error:null};
    if(table==='profiles')return {data:{role:'member'},error:null};
    if(table==='growth_experiments')return {data:experiment,error:null};
    assert.equal(table,'growth_experiment_assignments');return {data:{...loaded,growth_experiments:{project_id:'project',tenant_id:'owner'}},error:null};
  }};return q;},async rpc(name:string,args:Record<string,unknown>){
    calls++;assert.ok(['assign_growth_experiment','expose_growth_experiment'].includes(name));
    assert.equal(args.p_actor,'owner');assert.equal(args.p_tenant,'owner');assert.equal(args.p_project,'project');
    assert.deepEqual(args.p_allowed_roles,['viewer','operator','release_manager','recovery_manager','admin']);
    if(name==='assign_growth_experiment'){assert.deepEqual(args.p_expected,experiment);assert.equal(args.p_subject,'subject');assert.equal(args.p_variant,'a');}
    else {assert.equal((args.p_expected as any).id,'assignment');assert.equal(args.p_evidence,'proof');}
    return {data:shape==='null'?null:shape==='array'?[]:{assignment:returned,replayed},error:error?{code:error}:null};
  }};
  const service=new GrowthService(db as unknown as SupabaseClient),assign=()=>service.assignExperiment('owner','experiment','subject'),expose=()=>service.exposeExperiment('owner','assignment','proof');
  assert.deepEqual(await assign(),assignment);
  replayed=true;returned={...assignment,variant:'old',exposed_at:now,evidence_reference:'original'};assert.equal((await assign()).variant,'old');
  replayed=false;returned={...assignment,exposed_at:now,evidence_reference:'proof'};assert.deepEqual(await expose(),returned);
  replayed=true;returned={...assignment,exposed_at:now,evidence_reference:'winner'};assert.equal((await expose()).evidence_reference,'winner');
  loaded={...returned};assert.deepEqual(await expose(),returned);
  returned={...returned,evidence_reference:'changed'};await assert.rejects(expose(),{code:'storage_unavailable'});loaded={...assignment};
  for(const invoke of [assign,expose]){
    for(const patch of [{id:''},{tenant_id:'foreign'},{experiment_id:'foreign'},{subject_key:'foreign'},{variant:''},{assigned_at:'invalid'},
      {exposed_at:'invalid'},{evidence_reference:{secret:'must not leak'}}]){
      returned={...assignment,...(invoke===expose?{exposed_at:now,evidence_reference:'proof'}:{}),...patch};replayed=false;
      await assert.rejects(invoke(),{code:'storage_unavailable',statusCode:503});
    }
    returned=invoke===assign?{...assignment}:{...assignment,exposed_at:now,evidence_reference:'proof'};
    for(shape of ['null','array'])await assert.rejects(invoke(),{code:'storage_unavailable'});shape='object';
    for(const[code,expected,statusCode]of [['42501','forbidden',403],['P0002','not_found',404],['40001','conflict',409],['08006','storage_unavailable',503]] as const){
      error=code;await assert.rejects(invoke(),{code:expected,statusCode});
    }error=null;
  }
  returned={...assignment,variant:'changed'};await assert.rejects(assign(),{code:'storage_unavailable'});
  returned={...assignment,exposed_at:now,evidence_reference:'other'};replayed=false;await assert.rejects(expose(),{code:'storage_unavailable'});
  loaded={...assignment,id:'foreign'};const before=calls;await assert.rejects(expose(),{code:'not_found'});assert.equal(calls,before);
});

test('experiment admission snapshots loaded rows before project authority awaits',async()=>{
  for(const mode of ['assign','expose']){
    const now=new Date().toISOString(),experiment={id:'experiment',tenant_id:'owner',project_id:'project',allocation_seed:'seed',variants:[{key:'a',weight:1}]};
    const assignment={id:'assignment',experiment_id:'experiment',tenant_id:'owner',subject_key:'subject',variant:'a',assigned_at:now,exposed_at:null,evidence_reference:null,
      growth_experiments:{project_id:'project',tenant_id:'owner'}};
    let entered!:()=>void,release!:()=>void;const reached=new Promise<void>(r=>entered=r),hold=new Promise<void>(r=>release=r);
    const db={from(table:string){const q={select(){return q;},eq(){return q;},async maybeSingle(){
      if(table==='profiles')return {data:{role:'member'},error:null};
      if(table==='projects'){entered();await hold;return {data:{id:'project',user_id:'owner'},error:null};}
      return {data:table==='growth_experiments'?experiment:assignment,error:null};
    }};return q;},async rpc(_name:string,args:any){
      assert.equal(args.p_expected.tenant_id,'owner');assert.equal(args.p_project,'project');
      return {data:{assignment:{id:'assignment',experiment_id:'experiment',tenant_id:'owner',subject_key:'subject',variant:'a',assigned_at:now,
        exposed_at:mode==='assign'?null:now,evidence_reference:mode==='assign'?null:'proof'},replayed:false},error:null};
    }};
    const service=new GrowthService(db as unknown as SupabaseClient),pending=mode==='assign'?service.assignExperiment('owner','experiment','subject'):service.exposeExperiment('owner','assignment','proof');
    await reached;experiment.tenant_id='foreign';assignment.tenant_id='foreign';assignment.growth_experiments.project_id='foreign';release();
    assert.equal((await pending).tenant_id,'owner');
  }
});
