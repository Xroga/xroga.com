import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { test, type TestContext } from 'node:test';
import pg from 'pg';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { buildOutcomeFromTerminalRun, SupabaseBuildOutcomeStore } from '../ai/buildOutcomeMemory.js';
import { isRunCancellationRequested, requestRunCancellation } from '../ai/runStore.js';
import {loadRoutingOutcomes,recordRoutingOutcome,recentRoutingOutcomes,resetRoutingOutcomeCache,type RoutingOutcome} from '../ai/routingOutcomes.js';
import {createTenantContext,type TenantContext} from './tenantContext.js';
import {getTenantSupabaseAdmin,getGlobalSupabaseAdmin,probeDatabaseReadiness} from './serviceRoleGuard.js';

type FixtureUser = { id: string; token: string };
function guard(): void {
  assert.equal(process.env.CI, 'true');
  assert.equal(process.env.XB01_DISPOSABLE_SUPABASE, '1');
  assert.equal(process.env.SUPABASE_URL, 'http://127.0.0.1:54321');
}

/** Uses the canonical disposable users. Never runs against a provider project. */
export function registerBuildOutcomeAttemptTests(admin: SupabaseClient, getUsers: () => readonly FixtureUser[]): void {
  test('real routing telemetry writes bind issued owners and private restart history never crosses terminal learning ownership',async t=>{
    guard();const[owner,other]=getUsers(),runId=randomUUID(),contexts=[owner,other].map(actor=>createTenantContext({userId:actor.id,via:'remote_getuser'}));
    for(const forged of [owner.id,{...contexts[0]},structuredClone(contexts[0])])assert.throws(()=>getTenantSupabaseAdmin(forged as TenantContext),{status:401});
    for(const operation of ['unknown','__proto__','constructor',undefined])assert.throws(()=>getGlobalSupabaseAdmin(operation as never),/Unregistered service operation/);
    const ownedProfile=await getTenantSupabaseAdmin(contexts[0]).from('profiles').select('id').eq('id',owner.id).single();assert.equal(ownedProfile.error,null);assert.deepEqual(ownedProfile.data,{id:owner.id});
    assert.equal(await probeDatabaseReadiness(),undefined);
    t.after(async()=>{resetRoutingOutcomeCache();assert.equal((await admin.from('model_routing_outcomes').delete().eq('run_id',runId)).error,null);});
    const row=(userId:string):RoutingOutcome=>({runId,userId,taskClass:'routing_owner_fixture',modelId:'deepseek_v4_flash',mode:'balanced',inputTokens:1,outputTokens:2,repairLoops:0,modelSwitches:0,requiredCapabilities:['fixture'],finalVerificationOk:true});
    const rows=async()=>{const result=await admin.from('model_routing_outcomes').select('*').eq('run_id',runId).order('user_id');assert.equal(result.error,null);return result.data!;};
    for(const forged of [owner.id,{...contexts[0]},structuredClone(contexts[0])])await assert.rejects(recordRoutingOutcome(forged as TenantContext,row(owner.id)),{status:401});
    await assert.rejects(recordRoutingOutcome(contexts[0],row(other.id)),{status:404});assert.deepEqual(await rows(),[]);
    await Promise.all([recordRoutingOutcome(contexts[0],row(owner.id)),recordRoutingOutcome(contexts[1],row(other.id))]);
    const saved=await rows();assert.equal(saved.length,2);assert.deepEqual(saved.map(row=>row.user_id).sort(),[owner.id,other.id].sort());
    assert.ok(saved.every(row=>row.run_id===runId&&row.input_tokens===1&&row.output_tokens===2&&row.required_capabilities[0]==='fixture'));
    resetRoutingOutcomeCache();const loaded=await loadRoutingOutcomes();assert.ok(loaded.length<=500);assert.equal(loaded.filter(row=>row.runId===runId).length,2);
    for(const actor of [owner,other]){
      const learned=buildOutcomeFromTerminalRun({runId,userId:actor.id,terminalStatus:'error',iterationCount:0,output:null});assert.equal(learned.modelTelemetry.length,1);
      const browser:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${actor.token}`}}});
      const visible=await browser.from('model_routing_outcomes').select('user_id,run_id').eq('run_id',runId);assert.equal(visible.error,null);assert.deepEqual(visible.data,[{user_id:actor.id,run_id:runId}]);
      assert.ok((await browser.from('model_routing_outcomes').insert({run_id:runId,user_id:actor.id,task_class:'denied',model_id:'deepseek_v4_flash',routing_mode:'balanced'})).error);
    }
    const mutable=row(owner.id),originalFetch=globalThis.fetch;let intercepted=false;
    t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
      const url=new URL(String(input));assert.equal(url.origin,'http://127.0.0.1:54321');
      if(url.pathname.endsWith('/model_routing_outcomes')&&init?.method==='POST'){
        intercepted=true;mutable.userId=other.id;mutable.requiredCapabilities![0]='mutated';
      }
      return originalFetch(input,init);
    });
    await recordRoutingOutcome(contexts[0],mutable);assert.equal(intercepted,true);
    const final=await rows();assert.equal(final.length,3);assert.equal(final.filter(row=>row.user_id===owner.id).length,2);assert.equal(final.filter(row=>row.user_id===other.id).length,1);
    assert.ok(final.every(row=>row.required_capabilities[0]==='fixture'));
    assert.ok(recentRoutingOutcomes().filter(row=>row.runId===runId&&row.userId===owner.id).every(row=>row.requiredCapabilities?.[0]==='fixture'));
    const cached=recentRoutingOutcomes();
    await recordRoutingOutcome(contexts[0],{...row(owner.id),mode:'invalid' as RoutingOutcome['mode']});
    assert.deepEqual(await rows(),final);assert.deepEqual(recentRoutingOutcomes(),cached);
    await recordRoutingOutcome(contexts[0],row(owner.id));assert.equal((await rows()).length,4);
  });
  async function fixture(t: TestContext) {
    guard();
    const [owner, other] = getUsers();
    const runId = randomUUID(), generation = randomUUID(), completedAt = new Date().toISOString();
    const output = { type: 'error', code: 'BUILD_FAILED' };
    t.after(async () => {
      const outcomes = await admin.from('build_outcomes').delete().eq('run_id', runId).in('user_id', [owner.id, other.id]);
      assert.equal(outcomes.error, null);
      const run = await admin.from('swarm_runs').delete().eq('id', runId).eq('user_id', owner.id);
      assert.equal(run.error, null);
    });
    const inserted = await admin.from('swarm_runs').insert({ id: runId, user_id: owner.id, prompt: 'Synthetic learning fixture', status: 'error',
      output, feature_category: 'chat', completed_at: completedAt, iteration_count: 1, lease_generation: generation, worker_id: null });
    assert.equal(inserted.error, null);
    const store = new SupabaseBuildOutcomeStore({ generation, completedAt, output });
    await store.upsert(buildOutcomeFromTerminalRun({ runId, userId: owner.id, terminalStatus: 'error', featureCategory: 'chat', iterationCount: 1, completedAt, output }));
    const saved = await admin.from('build_outcomes').select('*').eq('run_id', runId).eq('user_id', owner.id).single();
    assert.equal(saved.error, null); assert.ok(saved.data);
    const args = { p_run_id: runId, p_owner_id: owner.id, p_generation: generation, p_completed_at: completedAt, p_output: output, p_outcome: saved.data };
    return { owner, other, runId, args, saved: saved.data };
  }

  test('real terminal learning excludes foreign-owner routing rows even when the run identifier matches', async t => {
    const f=await fixture(t),foreignId=randomUUID(),ownedId=randomUUID();
    t.after(async()=>{
      resetRoutingOutcomeCache();
      assert.equal((await admin.from('model_routing_outcomes').delete().in('id',[foreignId,ownedId])).error,null);
    });
    const row={run_id:f.runId,user_id:f.other.id,task_class:'coding',model_id:'deepseek_v4_flash',routing_mode:'balanced',
      input_tokens:1,output_tokens:2,repair_loops:0,model_switches:0,final_verification_ok:true};
    assert.equal((await admin.from('model_routing_outcomes').insert({...row,id:foreignId})).error,null);
    resetRoutingOutcomeCache();await loadRoutingOutcomes();
    const build=()=>buildOutcomeFromTerminalRun({runId:f.runId,userId:f.owner.id,terminalStatus:'error',featureCategory:'chat',
      iterationCount:1,completedAt:f.args.p_completed_at,output:f.args.p_output});
    const denied=build();assert.equal(denied.verified,false);assert.deepEqual(denied.modelTelemetry,[]);
    const store=new SupabaseBuildOutcomeStore({generation:f.args.p_generation,completedAt:f.args.p_completed_at,output:f.args.p_output});
    await store.upsert(denied);
    let saved=await admin.from('build_outcomes').select('user_id,verified,model_telemetry').eq('run_id',f.runId).single();
    assert.equal(saved.error,null);assert.equal(saved.data.user_id,f.owner.id);assert.equal(saved.data.verified,false);
    assert.deepEqual(saved.data.model_telemetry,[]);
    assert.equal((await admin.from('model_routing_outcomes').insert({...row,id:ownedId,user_id:f.owner.id})).error,null);
    resetRoutingOutcomeCache();await loadRoutingOutcomes();
    const allowed=build();assert.equal(allowed.verified,true);assert.equal(allowed.modelTelemetry.length,1);
    await store.upsert(allowed);
    saved=await admin.from('build_outcomes').select('user_id,verified,model_telemetry').eq('run_id',f.runId).single();
    assert.equal(saved.error,null);assert.equal(saved.data.user_id,f.owner.id);assert.equal(saved.data.verified,true);
    assert.equal(saved.data.model_telemetry.length,1);
  });

  test('real worker learning fence binds owner, epoch and exact terminal evidence', async t => {
    const f = await fixture(t);
    for (const patch of [
      { p_owner_id: f.other.id }, { p_generation: randomUUID() }, { p_generation: null },
      { p_completed_at: new Date(Date.parse(f.args.p_completed_at) + 1000).toISOString() },
      { p_output: { type: 'stale' } }, { p_outcome: { ...f.saved, iteration_count: 2 } },
      { p_outcome: { ...f.saved, terminal_status: 'complete' } },
      { p_outcome: { ...f.saved, user_id: f.other.id } }, { p_outcome: { ...f.saved, run_id: randomUUID() } },
      { p_outcome: { ...f.saved, unknown_field: 'not admitted' } },
    ]) {
      const denied = await admin.rpc('persist_build_outcome_attempt', { ...f.args, ...patch });
      assert.equal(denied.error, null); assert.equal(denied.data, false);
    }
    const repeated = await admin.rpc('persist_build_outcome_attempt', f.args);
    assert.equal(repeated.error, null); assert.equal(repeated.data, true);
    const read = () => admin.from('build_outcomes').select('*').eq('run_id', f.runId).single();
    assert.deepEqual((await read()).data, f.saved);
    const changed = await admin.from('swarm_runs').update({ output: { type: 'enriched' } }).eq('id', f.runId).eq('user_id', f.owner.id);
    assert.equal(changed.error, null);
    assert.equal((await admin.rpc('persist_build_outcome_attempt', f.args)).data, false);
    assert.deepEqual((await read()).data, f.saved);
    assert.equal((await admin.from('swarm_runs').update({ output: f.args.p_output }).eq('id', f.runId).eq('user_id', f.owner.id)).error, null);
    assert.equal((await admin.from('build_outcomes').update({ user_id: f.other.id }).eq('run_id', f.runId)).error, null);
    const foreign = await read(); assert.equal(foreign.error, null);
    const collision = await admin.rpc('persist_build_outcome_attempt', f.args);
    assert.equal(collision.error, null); assert.equal(collision.data, false);
    assert.deepEqual((await read()).data, foreign.data);
    for (const token of [null, f.owner.token]) {
      const browser = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
        ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}),
      });
      assert.equal((await browser.rpc('persist_build_outcome_attempt', f.args)).error?.code, '42501');
    }
  });

  async function cancelledFixture(t: TestContext) {
    const f = await fixture(t);
    assert.equal((await admin.from('swarm_runs').update({ status: 'running', completed_at: null }).eq('id', f.runId).eq('user_id', f.owner.id)).error, null);
    assert.equal(await isRunCancellationRequested(f.runId, f.owner.id), false);
    await assert.rejects(isRunCancellationRequested(f.runId, f.other.id), /Run authority is unavailable/);
    assert.equal(await requestRunCancellation(f.runId, f.owner.id), true);
    assert.equal(await isRunCancellationRequested(f.runId, f.owner.id), true);
    const run = await admin.from('swarm_runs').select('*').eq('id', f.runId).eq('user_id', f.owner.id).single();
    const saved = await admin.from('build_outcomes').select('*').eq('run_id', f.runId).eq('user_id', f.owner.id).single();
    assert.equal(run.error, null); assert.equal(saved.error, null);
    assert.equal(run.data.status, 'cancelled'); assert.equal(run.data.lease_generation, null);
    assert.equal(run.data.iteration_count, 2); assert.equal(saved.data.terminal_status, 'cancelled');
    assert.equal(saved.data.iteration_count, run.data.iteration_count);
    return { ...f, saved: saved.data, args: { p_run_id: f.runId, p_owner_id: f.owner.id,
      p_completed_at: run.data.completed_at, p_output: run.data.output, p_outcome: saved.data } };
  }

  test('real cancellation receipt rejects stale evidence, owner spoofing and browser execution', async t => {
    const f = await cancelledFixture(t);
    assert.equal(await requestRunCancellation(f.runId, f.owner.id), false);
    assert.equal(await requestRunCancellation(f.runId, f.other.id), false);
    for (const patch of [{ p_owner_id: f.other.id }, { p_completed_at: new Date(0).toISOString() },
      { p_output: { type: 'other' } }, { p_outcome: { ...f.saved, iteration_count: 1 } },
      { p_outcome: { ...f.saved, terminal_status: 'complete' } }, { p_outcome: { ...f.saved, success: true } },
      { p_outcome: { ...f.saved, failure_code: 'OTHER' } }]) {
      const denied = await admin.rpc('persist_cancelled_build_outcome', { ...f.args, ...patch });
      assert.equal(denied.error, null); assert.equal(denied.data, false);
    }
    const workerNull = await admin.rpc('persist_build_outcome_attempt', { ...f.args, p_generation: null });
    assert.equal(workerNull.error, null); assert.equal(workerNull.data, false, 'cancellation does not weaken worker fence');
    assert.equal((await admin.rpc('persist_cancelled_build_outcome', f.args)).data, true);
    const retained = await admin.from('build_outcomes').select('*').eq('run_id', f.runId).single();
    assert.equal(retained.error, null); assert.deepEqual(retained.data, f.saved);
    for (const token of [null, f.owner.token]) {
      const browser = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
        ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}),
      });
      assert.equal((await browser.rpc('cancel_swarm_run_owned', { p_run_id: f.runId, p_owner_id: f.owner.id })).error?.code, '42501');
      assert.equal((await browser.rpc('persist_cancelled_build_outcome', f.args)).error?.code, '42501');
    }
  });

  test('real concurrent cancellation claims produce one receipt and one iteration transition', async t => {
    const f = await fixture(t);
    assert.equal((await admin.from('swarm_runs').update({ status: 'running', completed_at: null }).eq('id', f.runId).eq('user_id', f.owner.id)).error, null);
    const second = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const args = { p_run_id: f.runId, p_owner_id: f.owner.id };
    const claims = await Promise.all([admin.rpc('cancel_swarm_run_owned', args), second.rpc('cancel_swarm_run_owned', args)]);
    for (const claim of claims) assert.equal(claim.error, null);
    assert.equal(claims.filter(claim => claim.data === null).length, 1);
    const receipt = claims.find(claim => claim.data !== null)!.data;
    assert.equal(receipt.id, f.runId); assert.equal(receipt.user_id, f.owner.id); assert.equal(receipt.iteration_count, 2);
    const final = await admin.from('swarm_runs').select('status,iteration_count,lease_generation,completed_at').eq('id', f.runId).eq('user_id', f.owner.id).single();
    assert.equal(final.error, null); assert.equal(final.data?.status, 'cancelled'); assert.equal(final.data?.iteration_count, 2);
    assert.equal(final.data?.lease_generation, null); assert.equal(Date.parse(final.data!.completed_at), Date.parse(receipt.completed_at));
  });

  for (const cancellation of [false, true]) test(`real two-session ${cancellation ? 'cancellation' : 'worker'} learning write blocked on parent lock loses to resumed epoch`, async t => {
    const f = cancellation ? await cancelledFixture(t) : await fixture(t);
    const url = new URL(process.env.XB01_LOCAL_DATABASE_URL!);
    assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '54322'); assert.equal(url.pathname, '/postgres');
    const locker = new pg.Client({ connectionString: url.href, ssl: false });
    const writer = new pg.Client({ connectionString: url.href, ssl: false });
    await locker.connect(); await writer.connect();
    let pending: Promise<pg.QueryResult> | undefined;
    try {
      await writer.query('set statement_timeout = 10000');
      const writerPid = (await writer.query('select pg_backend_pid() as pid')).rows[0].pid;
      const lockerPid = (await locker.query('select pg_backend_pid() as pid')).rows[0].pid;
      await writer.query('set role service_role');
      await locker.query('begin');
      await locker.query('select id from public.swarm_runs where id=$1 and user_id=$2 for update', [f.runId, f.owner.id]);
      pending = cancellation
        ? writer.query('select public.persist_cancelled_build_outcome($1,$2,$3,$4,$5) as ok',
          [f.runId, f.owner.id, f.args.p_completed_at, JSON.stringify(f.args.p_output), JSON.stringify(f.args.p_outcome)])
        : writer.query('select public.persist_build_outcome_attempt($1,$2,$3,$4,$5,$6) as ok',
          [f.runId, f.owner.id, 'p_generation' in f.args ? f.args.p_generation : null, f.args.p_completed_at, JSON.stringify(f.args.p_output), JSON.stringify(f.args.p_outcome)]);
      // Attach rejection handling immediately, but still assert the actual result below.
      void pending.catch(() => {});
      let blocked = false;
      for (let count = 0; count < 100; count++) {
        const observed = await locker.query('select pg_blocking_pids($1) as blockers', [writerPid]);
        if (observed.rows[0].blockers.includes(lockerPid)) { blocked = true; break; }
        await delay(20);
      }
      assert.equal(blocked, true, 'must observe the real blocked writer, not assume race timing');
      await locker.query("update public.swarm_runs set status='running',completed_at=null,lease_generation=$3,worker_id='fixture-new-worker' where id=$1 and user_id=$2", [f.runId, f.owner.id, randomUUID()]);
      await locker.query('commit');
      assert.equal((await pending).rows[0].ok, false);
      const retained = await admin.from('build_outcomes').select('*').eq('run_id', f.runId).eq('user_id', f.owner.id).single();
      assert.equal(retained.error, null); assert.deepEqual(retained.data, f.saved);
    } finally {
      await locker.query('rollback');
      if (pending) await pending.catch(() => {});
      await writer.end(); await locker.end();
    }
  });
}
