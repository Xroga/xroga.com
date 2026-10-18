import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import pg from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';
import { OperationsService } from './operationsService.js';

export function registerActionIntentTests(admin: SupabaseClient, getUsers: () => readonly { id: string; project: string }[]): void {
  test('real single-rule stop records blocked when the target changes while its adapter waits', async t => {
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');
    assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const url=new URL(process.env.XB01_LOCAL_DATABASE_URL!);
    assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'54322');assert.equal(url.pathname,'/postgres');
    const [owner]=getUsers(),key=randomUUID(),ruleId=randomUUID(),service=new OperationsService(admin);
    t.after(async()=>{
      assert.equal((await admin.from('operations_actions').delete().eq('user_id',owner.id).eq('idempotency_key',key)).error,null);
      assert.equal((await admin.from('operations_automation_rules').delete().eq('user_id',owner.id).eq('id',ruleId)).error,null);
    });
    assert.equal((await admin.from('operations_automation_rules').insert({id:ruleId,user_id:owner.id,project_id:owner.project,
      rule_key:key,name:'Disposable conditional control',trigger_type:'fixture',risk_level:'low',action_type:'refresh_health',enabled:false})).error,null);
    const action=await service.createAction(owner.id,{actionType:'emergency_stop',projectId:owner.project,targetType:'automation',
      targetId:ruleId,targetVersion:1,idempotencyKey:key,confirmed:false});
    const db=new pg.Client({connectionString:url.href,ssl:false});await db.connect();let pending:Promise<Record<string,any>>|undefined;
    try{
      await db.query('begin');await db.query('select id from operations_automation_rules where id=$1 for update',[ruleId]);
      // Also exercises confirmation without independent approval, then the
      // canonical admitted claim and real internal adapter, no provider call.
      pending=service.confirmAction(owner.id,action.id);void pending.catch(()=>{});
      let blocked=false;
      for(let i=0;i<150;i++){
        await db.query('select pg_stat_clear_snapshot()');
        const rows=await db.query("select pid from pg_stat_activity where pid<>pg_backend_pid() and wait_event_type='Lock' and query like '%operations_automation_rules%' and query ilike '%update%'");
        if(rows.rowCount){blocked=true;break;}await delay(20);
      }
      assert.equal(blocked,true,'actual internal conditional write reached the target row lock');
      await db.query('update operations_automation_rules set version=2 where id=$1',[ruleId]);await db.query('commit');
      const result=await pending;pending=undefined;assert.equal(result.status,'blocked');assert.equal(result.attempt_count,1);
      const rule=await admin.from('operations_automation_rules').select('version,emergency_stopped').eq('id',ruleId).single();
      assert.equal(rule.error,null);assert.deepEqual(rule.data,{version:2,emergency_stopped:false});
      const runs=await admin.from('operations_action_runs').select('status,error_category').eq('action_id',action.id);
      assert.equal(runs.error,null);assert.deepEqual(runs.data,[{status:'blocked',error_category:'invalid_state'}]);
      const evidence=await admin.from('production_evidence').select('status').eq('action_id',action.id);
      assert.equal(evidence.error,null);assert.deepEqual(evidence.data,[{status:'blocked'}]);
    }finally{await db.query('rollback');if(pending)await Promise.allSettled([pending]);await db.end();}
  });
  test('real release and deployment actions require the owned project target before creating drafts', async t => {
    assert.equal(process.env.CI, 'true'); assert.equal(process.env.XB01_DISPOSABLE_SUPABASE, '1');
    assert.equal(process.env.SUPABASE_URL, 'http://127.0.0.1:54321');
    const [owner, other] = getUsers(), service = new OperationsService(admin);
    const releases = [randomUUID(),randomUUID()], deployments = [randomUUID(),randomUUID()], keys: string[] = [];
    const prior = await admin.from('operations_memberships').select('*').eq('project_id', owner.project).eq('member_user_id', other.id).maybeSingle();
    assert.equal(prior.error, null);
    const membershipId = prior.data?.id ?? randomUUID();
    t.after(async () => {
      if (keys.length) assert.equal((await admin.from('operations_actions').delete().eq('user_id', owner.id).in('idempotency_key', keys)).error, null);
      assert.equal((await admin.from('production_releases').delete().in('id', releases)).error, null);
      assert.equal((await admin.from('deployment_status').delete().in('id', deployments)).error, null);
      if (prior.data) assert.equal((await admin.from('operations_memberships').upsert(prior.data)).error, null);
      else assert.equal((await admin.from('operations_memberships').delete().eq('id', membershipId)).error, null);
    });
    assert.equal((await admin.from('operations_memberships').upsert({ id: membershipId, user_id: owner.id, project_id: owner.project,
      member_user_id: other.id, role: 'release_manager', created_by: owner.id }, { onConflict: 'project_id,member_user_id' })).error, null);
    assert.equal((await service.permissions(other.id, owner.project)).role, 'release_manager');
    for (const [index,user] of [owner,other].entries()) {
      assert.equal((await admin.from('production_releases').insert({ id: releases[index], user_id: user.id, project_id: user.project,
        commit_sha: '0'.repeat(40), artifact_digest: randomUUID(), environment: 'preview', manifest: {}, state: 'created', created_by: user.id })).error, null);
      assert.equal((await admin.from('deployment_status').insert({ id: deployments[index], user_id: user.id, project_id: user.project,
        target: 'github', status: 'pending' })).error, null);
    }
    for (const [targetType,actionType,targets] of [['release','promote_release',releases],['deployment','prepare_repair',deployments]] as const) {
      const key = randomUUID(); keys.push(key);
      const input = { projectId: owner.project, targetType, actionType, targetId: targets[1], targetVersion: 1, idempotencyKey: key, confirmed: false };
      await assert.rejects(service.createAction(other.id, input), { code: 'forbidden', statusCode: 403 });
      const draft = await service.createAction(other.id, { ...input, targetId: targets[0] });
      assert.equal(draft.status, 'confirmation_required'); assert.equal(draft.target_id, targets[0]);
      const runs = await admin.from('operations_action_runs').select('id').eq('action_id', draft.id);
      assert.equal(runs.error, null); assert.deepEqual(runs.data, []);
    }
  });
  test('real action claim executes only the owned disposable automation rule once', async t => {
    assert.equal(process.env.CI, 'true'); assert.equal(process.env.XB01_DISPOSABLE_SUPABASE, '1');
    assert.equal(process.env.SUPABASE_URL, 'http://127.0.0.1:54321');
    const [owner, other] = getUsers(), key = randomUUID(), ruleId = randomUUID();
    const service = new OperationsService(admin);
    t.after(async () => {
      assert.equal((await admin.from('operations_actions').delete().eq('user_id', owner.id).eq('idempotency_key', key)).error, null);
      assert.equal((await admin.from('operations_automation_rules').delete().eq('user_id', owner.id).eq('id', ruleId)).error, null);
    });
    const inserted = await admin.from('operations_automation_rules').insert({ id: ruleId, user_id: owner.id,
      project_id: owner.project, rule_key: key, name: 'Disposable claim fixture', trigger_type: 'fixture',
      risk_level: 'low', action_type: 'refresh_health', enabled: false });
    assert.equal(inserted.error, null);
    const input = { actionType: 'emergency_stop', projectId: owner.project, targetType: 'automation', targetId: ruleId,
      targetVersion: 1, idempotencyKey: key, confirmed: true, parameters: {} };
    await assert.rejects(service.createAction(other.id, input), { code: 'forbidden', statusCode: 403 });
    const result = await service.createAction(owner.id, input);
    assert.equal(result.status, 'verified'); assert.equal(result.attempt_count, 1);
    assert.equal(result.lease_owner, null); assert.equal(result.lease_expires_at, null);
    assert.equal((await service.executeAction(owner.id, result.id)).id, result.id);
    await assert.rejects(service.executeAction(other.id, result.id), { code: 'forbidden', statusCode: 403 });
    const rule = await admin.from('operations_automation_rules').select('version,emergency_stopped').eq('id', ruleId).single();
    assert.equal(rule.error, null); assert.deepEqual(rule.data, { version: 2, emergency_stopped: true });
    const runs = await admin.from('operations_action_runs').select('attempt,status,provider').eq('action_id', result.id);
    assert.equal(runs.error, null); assert.deepEqual(runs.data, [{ attempt: 1, status: 'verified', provider: 'internal_database' }]);
  });
  test('real concurrent action creation preserves one actor plan and cannot confirm through replay', async t => {
    assert.equal(process.env.CI, 'true'); assert.equal(process.env.XB01_DISPOSABLE_SUPABASE, '1');
    assert.equal(process.env.SUPABASE_URL, 'http://127.0.0.1:54321');
    const [owner, other] = getUsers(), key = randomUUID(), service = new OperationsService(admin);
    t.after(async () => { assert.equal((await admin.from('operations_actions').delete().eq('user_id', owner.id).eq('idempotency_key', key)).error, null); });
    const input = { actionType: 'emergency_stop', projectId: owner.project, targetType: 'automation', targetId: owner.project,
      targetVersion: 1, idempotencyKey: key, confirmed: false, parameters: { reason: 'isolated intent fixture' } };
    const url = new URL(process.env.XB01_LOCAL_DATABASE_URL!);
    assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '54322'); assert.equal(url.pathname, '/postgres');
    const locker = new pg.Client({ connectionString: url.href, ssl: false }); await locker.connect();
    let attempts: Promise<Record<string, any>>[] = [];
    try {
      await locker.query('begin'); await locker.query('lock table public.operations_actions in share mode');
      attempts = [service.createAction(owner.id, input), service.createAction(owner.id, input)];
      attempts.forEach(pending => void pending.catch(() => {}));
      let blocked = false;
      for (let i = 0; i < 150; i++) {
        const result = await locker.query("select count(*)::int n from pg_locks where relation='public.operations_actions'::regclass and mode='RowExclusiveLock' and not granted");
        if (result.rows[0].n >= 2) { blocked = true; break; } await delay(20);
      }
      assert.equal(blocked, true, 'both HTTP inserts reached the PostgreSQL lock'); await locker.query('commit');
      const [first, second] = await Promise.all(attempts);
      assert.equal(first.id, second.id); assert.equal(first.status, 'confirmation_required');
      for (const patch of [{ targetVersion: 2 }, { parameters: { reason: 'changed' } }, { actionType: 'resume_automation' }]) {
        await assert.rejects(service.createAction(owner.id, { ...input, ...patch }), { code: 'conflict', statusCode: 409 });
      }
      await assert.rejects(service.createAction(other.id, input), { code: 'forbidden', statusCode: 403 });
      const replay = await service.createAction(owner.id, { ...input, confirmed: true });
      assert.equal(replay.status, 'confirmation_required'); assert.equal(replay.confirmation_digest, null);
      const stored = await admin.from('operations_actions').select('*').eq('user_id', owner.id).eq('idempotency_key', key);
      assert.equal(stored.error, null); assert.equal(stored.data?.length, 1); assert.equal(stored.data![0].action_plan_digest, first.action_plan_digest);
      assert.equal(stored.data![0].requested_by, owner.id); assert.equal(stored.data![0].status, 'confirmation_required');
      const runs = await admin.from('operations_action_runs').select('id').eq('action_id', first.id);
      assert.equal(runs.error, null); assert.deepEqual(runs.data, []);
      const audit = await admin.from('production_audit_log').select('id').eq('user_id', owner.id).eq('target_id', first.id).eq('action', 'operations.action.requested');
      assert.equal(audit.error, null); assert.equal(audit.data?.length, 1);
    } finally {
      await locker.query('rollback'); await Promise.allSettled(attempts); await locker.end();
    }
  });
}
