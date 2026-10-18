import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import pg from 'pg';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function registerBusinessConfirmationFinishTests(admin:SupabaseClient,getUsers:()=>readonly {id:string;token:string}[]):void{
  test('real confirmation finish binds the original claim and admits one immutable terminal outcome',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');
    assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const url=new URL(process.env.XB01_LOCAL_DATABASE_URL!);
    assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'54322');assert.equal(url.pathname,'/postgres');
    const [owner,other]=getUsers(),ids:string[]=[];
    const plan={version:'1.0',sessionId:'trs_fixture',useCase:'fixture',toolkit:'fixture',toolSlug:'fixture',arguments:{},
      risk:'write',requiresConfirmation:true,summary:'Synthetic receipt only, no provider execution',requiredScopes:[],planDigest:'a'.repeat(64)};
    t.after(async()=>{if(ids.length)assert.equal((await admin.from('business_action_confirmations').delete().in('id',ids)).error,null);});
    const db=new pg.Client({connectionString:url.href,ssl:false});await db.connect();let pending:PromiseLike<any>[]=[];
    const seed=async(seconds=120):Promise<Record<string,any>>=>{
      const id=randomUUID();ids.push(id);
      const inserted=await db.query(`insert into business_action_confirmations(id,user_id,plan,plan_digest,summary,toolkit,risk,expires_at)
        values($1,$2,$3,$4,$5,'fixture','write',clock_timestamp()+make_interval(secs=>$6)) returning to_jsonb(business_action_confirmations) value`,
        [id,owner.id,plan,plan.planDigest,plan.summary,seconds]);
      const row=inserted.rows[0].value;
      const claim=await admin.rpc('claim_business_action_confirmation',{p_owner:owner.id,p_id:id,p_digest:plan.planDigest,p_plan:plan,p_expires:row.expires_at}).maybeSingle<Record<string,any>>();
      assert.equal(claim.error,null);assert.equal(claim.data?.status,'executing');return claim.data!;
    };
    const args=(row:Record<string,unknown>,status='consumed')=>({p_owner:owner.id,p_expected:row,p_status:status,p_failure_code:status==='failed'?'fixture_failed':null});
    const waitFor=async(count:number)=>{
      for(let i=0;i<150;i++){
        await db.query('select pg_stat_clear_snapshot()');
        const rows=await db.query("select pid from pg_stat_activity where pid<>pg_backend_pid() and wait_event_type='Lock' and query like '%finish_business_action_confirmation%'");
        if((rows.rowCount??0)>=count)return;await delay(20);
      }
      assert.fail('all terminal requests must reach the held PostgreSQL claim row');
    };
    try{
      for(const mode of ['plan','claim','competing']){
        const row=await seed();await db.query('begin');await db.query('select id from business_action_confirmations where id=$1 for update',[row.id]);
        pending=(mode==='competing'?['consumed','failed']:['consumed']).map(status=>Promise.resolve(admin.rpc('finish_business_action_confirmation',args(row,status)).maybeSingle()));
        await waitFor(pending.length);
        if(mode==='plan')await db.query("update business_action_confirmations set plan=jsonb_set(plan,'{arguments}','{\"changed\":true}') where id=$1",[row.id]);
        if(mode==='claim')await db.query("update business_action_confirmations set claimed_at=claimed_at+interval '1 second' where id=$1",[row.id]);
        await db.query('commit');const receipts=await Promise.all(pending);pending=[];
        if(mode!=='competing'){
          assert.equal(receipts[0].error?.code,'40001');
          const stored=await admin.from('business_action_confirmations').select('status,completed_at').eq('id',row.id).single();
          assert.equal(stored.error,null);assert.deepEqual(stored.data,{status:'executing',completed_at:null});
        }else{
          const winners=receipts.filter(r=>!r.error);assert.equal(winners.length,1);assert.equal(receipts.filter(r=>r.error?.code==='40001').length,1);
          const winner=winners[0].data;
          const replay=await admin.rpc('finish_business_action_confirmation',args(row,winner.status)).maybeSingle<Record<string,any>>();
          assert.equal(replay.error,null);assert.equal(replay.data?.completed_at,winner.completed_at);
        }
      }
      const row=await seed(3);await db.query('begin');
      await db.query(`alter table business_action_confirmations add constraint fixture_finish_failure check(id<>'${row.id}' or status<>'consumed') not valid`);
      await db.query('savepoint attempt');
      await assert.rejects(db.query('select * from finish_business_action_confirmation($1,$2,$3,$4)',[owner.id,row,'consumed',null]),{code:'23514'});
      await db.query('rollback to savepoint attempt');
      assert.deepEqual((await db.query('select status,completed_at from business_action_confirmations where id=$1',[row.id])).rows[0],{status:'executing',completed_at:null});await db.query('rollback');
      assert.equal((await admin.rpc('finish_business_action_confirmation',{...args(row),p_owner:other.id})).error?.code,'22023');
      for(const token of [undefined,owner.token]){
        const browser:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},...(token?{global:{headers:{Authorization:`Bearer ${token}`}}}:{})});
        assert.equal((await browser.rpc('finish_business_action_confirmation',args(row))).error?.code,'42501');
      }
      await db.query('select pg_sleep(greatest(0,extract(epoch from ($1::timestamptz-clock_timestamp())))+0.05)',[row.expires_at]);
      const completed=await admin.rpc('finish_business_action_confirmation',args(row)).maybeSingle<Record<string,any>>();
      assert.equal(completed.error,null);assert.equal(completed.data?.status,'consumed');
      assert.ok(Number.isFinite(Date.parse(completed.data?.completed_at)));
    }finally{await db.query('rollback');await Promise.all(pending);await db.end();}
  });
}
