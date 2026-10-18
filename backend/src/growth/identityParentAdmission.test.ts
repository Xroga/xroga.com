import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {SupabaseClient} from '@supabase/supabase-js';
import {GrowthService} from './growthService.js';

test('identity linking rejects a project owner change after preflight before writing any binding',async()=>{
  let currentOwner='actor',writes=0;
  const row={id:'identity',tenant_id:'actor',project_id:'project',anonymous_id:'anonymous',user_id:'actor',evidence_reference:'proof'};
  const db={from(table:string){const q={select(){return q;},eq(){return q;},
    async maybeSingle(){if(table==='projects'){currentOwner='foreign';return{data:{id:'project',user_id:'actor'},error:null};}return{data:{role:'member'},error:null};},
    upsert(){writes++;return q;},update(){writes++;return q;},
    then(resolve:(v:unknown)=>unknown){return Promise.resolve(resolve({data:[row],error:null}));}
  };return q;},async rpc(name:string,args:Record<string,unknown>){
    assert.equal(name,'link_growth_identity');assert.equal(args.p_tenant,'actor');assert.equal(currentOwner,'foreign');
    return{data:null,error:{code:'42501',message:'PRIVATE_DATABASE_CANARY'}};
  }};
  await assert.rejects(new GrowthService(db as unknown as SupabaseClient).linkIdentity('actor',
    {projectId:'project',anonymousId:'anonymous',evidenceReference:'proof'}),{code:'forbidden',statusCode:403});
  assert.equal(writes,0,'No unguarded fallback insert or update');
});
