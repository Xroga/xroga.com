import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';
import pg from 'pg';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';

export function registerProviderCycleParentTests(admin:SupabaseClient):void{
  test('real provider budget parent admission rejects misbound cycles and serializes ownership changes before replay settle and release',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const users:string[]=[],tokens:string[]=[];
    t.after(async()=>{for(const user of users)assert.equal((await admin.auth.admin.deleteUser(user)).error,null);});
    for(let i=0;i<2;i++){
      const email=`cycle-parent-${randomUUID()}@example.invalid`,password=`Synthetic-${randomUUID()}!`;
      const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(created.error,null);assert.ok(created.data.user);users.push(created.data.user.id);
      const client:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{autoRefreshToken:false,persistSession:false}});
      const signed=await client.auth.signInWithPassword({email,password});assert.equal(signed.error,null);assert.ok(signed.data.session);tokens.push(signed.data.session.access_token);
    }
    const [owner,other]=users,ownCycle=randomUUID(),foreignCycle=randomUUID(),bad=randomUUID(),badKey=randomUUID();
    const seedCycle=async(id:string,user:string,status='active')=>{const result=await admin.from('xroga_billing_cycles').insert({id,user_id:user,cycle_kind:'paid',status,starts_at:new Date().toISOString(),ends_at:new Date(Date.now()+30*86400000).toISOString(),reserved_micro_usd:10000});assert.equal(result.error,null);};
    const seedReservation=async(id:string,cycle:string,key:string,status='reserved')=>{const result=await admin.from('xroga_provider_reservations').insert({id,cycle_id:cycle,user_id:owner,idempotency_key:key,purpose:'daily_work',internal_route:'fixture',price_version:'fixture',estimated_input_tokens:0,maximum_output_tokens:0,reserved_micro_usd:1000,status});assert.equal(result.error,null);};
    const cycleRows=async()=>{const result=await admin.from('xroga_billing_cycles').select('id,user_id,reserved_micro_usd,settled_micro_usd,accounting_safety_hold_micro_usd').in('user_id',users).order('id');assert.equal(result.error,null);return result.data;};
    const reservations=async()=>{const result=await admin.from('xroga_provider_reservations').select('*').eq('user_id',owner).order('id');assert.equal(result.error,null);return result.data;};
    await seedCycle(ownCycle,owner);await seedCycle(foreignCycle,other);await seedReservation(bad,foreignCycle,badKey);
    const reserveArgs=(user=owner,key=badKey)=>({p_user_id:user,p_idempotency_key:key,p_purpose:'daily_work',p_internal_route:'fixture',p_price_version:'fixture',p_estimated_input_tokens:0,p_maximum_output_tokens:0,p_reservation_micro_usd:1000});
    const settleArgs=(id=bad,user=owner)=>({p_user_id:user,p_reservation_id:id,p_actual_micro_usd:100,p_provider_request_id:'synthetic',p_actual_input_tokens:0,p_cached_input_tokens:0,p_output_tokens:0});
    const releaseArgs=(id=bad,pending=false,user=owner)=>({p_user_id:user,p_reservation_id:id,p_error_category:'synthetic',p_pending_reconciliation:pending});
    for(const status of ['reserved','pending_reconciliation','settled','released']){
      assert.equal((await admin.from('xroga_provider_reservations').update({status}).eq('id',bad)).error,null);
      const before=[await cycleRows(),await reservations()];
      for(const [name,args]of [['reserve_xroga_provider_budget',reserveArgs()],['settle_xroga_provider_budget',settleArgs()],['release_xroga_provider_budget',releaseArgs()],['release_xroga_provider_budget',releaseArgs(bad,true)]] as const){
        const denied=await admin.rpc(name,args);assert.equal(denied.error?.code,'42501');assert.match(denied.error?.message??'',/provider_cycle_owner_mismatch/);
        assert.deepEqual([await cycleRows(),await reservations()],before,'Parent denial must preserve both cycles and the exact reservation receipt');
      }
    }
    // Same-owner concurrency and terminal replay preserve the existing contract.
    const key=randomUUID(),created=await Promise.all(Array.from({length:4},()=>admin.rpc('reserve_xroga_provider_budget',reserveArgs(owner,key))));
    assert.ok(created.every(row=>!row.error));assert.equal(new Set(created.map(row=>row.data.id)).size,1);
    const admitted=created[0].data;assert.equal(admitted.user_id,owner);assert.equal(admitted.cycle_id,ownCycle);assert.equal(Number(admitted.reserved_micro_usd),1000);
    const beforeForeign=await cycleRows();assert.ok((await admin.rpc('settle_xroga_provider_budget',settleArgs(admitted.id,other))).error);assert.deepEqual(await cycleRows(),beforeForeign);
    const settled=await admin.rpc('settle_xroga_provider_budget',settleArgs(admitted.id));assert.equal(settled.error,null);assert.equal(settled.data.status,'settled');assert.equal(settled.data.user_id,owner);assert.equal(settled.data.cycle_id,ownCycle);assert.equal(Number(settled.data.settled_micro_usd),100);
    const settledSnapshot=[await cycleRows(),await reservations()];assert.equal((await admin.rpc('settle_xroga_provider_budget',settleArgs(admitted.id))).error,null);assert.deepEqual([await cycleRows(),await reservations()],settledSnapshot);
    const released=await admin.rpc('reserve_xroga_provider_budget',reserveArgs(owner,randomUUID()));assert.equal(released.error,null);
    const releasedReceipt=await admin.rpc('release_xroga_provider_budget',releaseArgs(released.data.id));assert.equal(releasedReceipt.error,null);assert.equal(releasedReceipt.data.status,'released');
    const releasedSnapshot=[await cycleRows(),await reservations()];assert.equal((await admin.rpc('release_xroga_provider_budget',releaseArgs(released.data.id))).error,null);assert.deepEqual([await cycleRows(),await reservations()],releasedSnapshot);
    for(const token of [undefined,...tokens]){
      const browser:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{autoRefreshToken:false,persistSession:false},...(token?{global:{headers:{Authorization:`Bearer ${token}`}}}:{})});
      for(const [name,args]of [['reserve_xroga_provider_budget',reserveArgs()],['settle_xroga_provider_budget',settleArgs()],['release_xroga_provider_budget',releaseArgs()]] as const)assert.equal((await browser.rpc(name,args)).error?.code,'42501');
    }

    const database=new URL(process.env.XB01_LOCAL_DATABASE_URL!);assert.equal(database.hostname,'127.0.0.1');assert.equal(database.port,'54322');assert.equal(database.pathname,'/postgres');
    const locker=new pg.Client({connectionString:database.href,ssl:false}),writer=new pg.Client({connectionString:database.href,ssl:false});await locker.connect();await writer.connect();
    try{
      await writer.query("set statement_timeout='10s';set role service_role");
      await writer.query("select set_config('request.jwt.claims',$1,false),set_config('request.jwt.claim.role','service_role',false)",[JSON.stringify({role:'service_role',sub:owner})]);
      const wp=(await writer.query('select pg_backend_pid() pid')).rows[0].pid,lp=(await locker.query('select pg_backend_pid() pid')).rows[0].pid;
      for(const changed of ['cycle_owner','reservation_parent'])for(const action of ['replay','settle','release','pending']){
        const cycle=randomUUID(),reservation=randomUUID(),lockKey=randomUUID();await seedCycle(cycle,owner,'paused');await seedReservation(reservation,cycle,lockKey);
        const beforeReservations=await reservations(),beforeCycle=(await cycleRows())!.find(row=>row.id===cycle)!;
        await locker.query('begin');
        if(changed==='cycle_owner')await locker.query('update public.xroga_billing_cycles set user_id=$1 where id=$2',[other,cycle]);
        else await locker.query('update public.xroga_provider_reservations set cycle_id=$1 where id=$2',[foreignCycle,reservation]);
        const pending=action==='replay'?writer.query("select public.reserve_xroga_provider_budget($1,$2,'daily_work','fixture','fixture',0,0,1000)",[owner,lockKey])
          :action==='settle'?writer.query("select public.settle_xroga_provider_budget($1,$2,100,'synthetic',0,0,0)",[owner,reservation])
          :writer.query("select public.release_xroga_provider_budget($1,$2,'synthetic',$3)",[owner,reservation,action==='pending']);
        void pending.catch(()=>{});
        try{
          let waiting=false;for(let attempt=0;attempt<150;attempt++){
            if((await locker.query('select pg_blocking_pids($1) blockers',[wp])).rows[0].blockers.includes(lp)){waiting=true;break;}await delay(20);
          }
          assert.equal(waiting,true,'The actual owner transfer must block the budget operation');await locker.query('commit');
          await assert.rejects(pending,{code:'42501'});
          assert.deepEqual(await reservations(),changed==='cycle_owner'?beforeReservations:beforeReservations!.map(row=>row.id===reservation?{...row,cycle_id:foreignCycle}:row));
          assert.deepEqual((await cycleRows())!.find(row=>row.id===cycle),changed==='cycle_owner'?{...beforeCycle,user_id:other}:beforeCycle,'No balance changes after parent ownership or reference moved during the wait');
        }finally{await locker.query('rollback');await pending.catch(()=>{});}
      }
      // A transaction rollback must undo both accounting and receipt changes.
      const rollback=await admin.rpc('reserve_xroga_provider_budget',reserveArgs(owner,randomUUID()));assert.equal(rollback.error,null);
      const beforeRollback=[await cycleRows(),await reservations()];await writer.query('begin');
      await writer.query("select public.settle_xroga_provider_budget($1,$2,100,'rollback',0,0,0)",[owner,rollback.data.id]);await writer.query('rollback');
      assert.deepEqual([await cycleRows(),await reservations()],beforeRollback);
    }finally{await locker.query('rollback');await writer.query('rollback');await writer.end();await locker.end();}
  });
}
