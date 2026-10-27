import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {assertCurrentRunAttempt,captureAdmittedRunAttempt,createRunDurable,withRunAttempt} from './runStore.js';

test('dispatch requires a fresh running worker generation, not merely a non-cancelled row',async()=>{
  const keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','NODE_ENV'];const prior=keys.map(key=>process.env[key]);
  const originalFetch=globalThis.fetch;let row:Record<string,unknown>={};let unavailable=false;
  process.env.SUPABASE_URL='http://127.0.0.1:49229';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-only';process.env.NODE_ENV='production';
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input));assert.equal(url.pathname,'/rest/v1/swarm_runs');
    if(init?.method==='POST'){row=JSON.parse(String(init.body));return new Response(null,{status:201});}
    assert.equal(url.searchParams.get('id'),'eq.'+row.id);assert.equal(url.searchParams.get('user_id'),'eq.'+row.user_id);
    return unavailable?Response.json({message:'PRIVATE_STORE_CANARY'},{status:400}):Response.json(row);
  };
  try {
    await withRunAttempt(async()=>{
      const owner=randomUUID(),run=randomUUID();await createRunDurable(owner,'Synthetic dispatch admission',run);
      const attempt=captureAdmittedRunAttempt(run,owner);await assertCurrentRunAttempt(attempt);
      for(const status of ['error','complete','completed','cancelled']){
        row={...row,status};await assert.rejects(assertCurrentRunAttempt(attempt),error=>error instanceof Error,status);
      }
      row={...row,status:'running',worker_id:'other'};await assert.rejects(assertCurrentRunAttempt(attempt));
      row={...row,worker_id:attempt.workerId,lease_generation:randomUUID()};await assert.rejects(assertCurrentRunAttempt(attempt));
      row={...row,lease_generation:attempt.generation};unavailable=true;
      await assert.rejects(assertCurrentRunAttempt(attempt),error=>error instanceof Error&&!error.message.includes('PRIVATE_STORE_CANARY'));
      await assert.rejects(assertCurrentRunAttempt(structuredClone(attempt)),{code:'RUN_STATE_CONFLICT'});
    });
  }finally{globalThis.fetch=originalFetch;keys.forEach((key,index)=>{if(prior[index]===undefined)delete process.env[key];else process.env[key]=prior[index];});}
});
