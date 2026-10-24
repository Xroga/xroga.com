import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GrowthService } from './growthService.js';

export function registerGrowthIdentityTests(admin: SupabaseClient): void {
  test('real growth identity first claims cannot reassign another authorized project user', async t => {
    assert.equal(process.env.CI, 'true'); assert.equal(process.env.XB01_DISPOSABLE_SUPABASE, '1');
    assert.equal(process.env.SUPABASE_URL, 'http://127.0.0.1:54321');
    const users: string[] = []; let project: string | undefined;
    t.after(async () => {
      if (project) assert.equal((await admin.from('projects').delete().eq('id', project)).error, null);
      for (const id of users) assert.equal((await admin.auth.admin.deleteUser(id)).error, null);
    });
    for (let i = 0; i < 2; i++) {
      const created = await admin.auth.admin.createUser({ email: `growth-identity-${randomUUID()}@example.invalid`, email_confirm: true });
      assert.equal(created.error, null); assert.ok(created.data.user); users.push(created.data.user.id);
    }
    const created = await admin.from('projects').insert({ user_id: users[0], name: 'Identity binding fixture', type: 'app' }).select('id').single();
    assert.equal(created.error, null); assert.ok(created.data); project = created.data.id as string;
    assert.equal((await admin.from('operations_memberships').insert({ user_id: users[0], project_id: project, member_user_id: users[1], role: 'viewer', created_by: users[0] })).error, null);
    const service = new GrowthService(admin);
    const input = { projectId: project, anonymousId: randomUUID(), evidenceReference: 'fixture:first' };
    const first = await service.linkIdentity(users[0], input);
    const refreshed = await service.linkIdentity(users[0], { ...input, evidenceReference: 'fixture:refresh' });
    assert.equal(refreshed.id, first.id); assert.equal(refreshed.evidence_reference, 'fixture:refresh');
    await assert.rejects(service.linkIdentity(users[1], input), { code: 'identity_conflict', statusCode: 409 });
    const unchanged = await admin.from('growth_identity_links').select('*').eq('id', first.id).single();
    assert.equal(unchanged.error, null); assert.equal(unchanged.data?.user_id, users[0]); assert.equal(unchanged.data?.evidence_reference, 'fixture:refresh');

    const database = new URL(process.env.XB01_LOCAL_DATABASE_URL!);
    assert.equal(database.hostname, '127.0.0.1'); assert.equal(database.port, '54322'); assert.equal(database.pathname, '/postgres');
    const locker = new pg.Client({ connectionString: database.href, ssl: false });
    await locker.connect();
    const racing = { ...input, anonymousId: randomUUID() };
    let attempts: Promise<PromiseSettledResult<Record<string, any>>[]> | undefined;
    try {
      await locker.query('begin'); await locker.query('lock table public.growth_identity_links in share mode');
      attempts = Promise.allSettled(users.map(user => service.linkIdentity(user, racing)));
      let blocked = false;
      for (let i = 0; i < 100; i++) {
        const result = await locker.query("select count(*)::int as n from pg_locks where relation='public.growth_identity_links'::regclass and mode='RowExclusiveLock' and not granted");
        if (result.rows[0].n >= 2) { blocked = true; break; }
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      assert.equal(blocked, true, 'both independent HTTP insert transactions must reach the database lock');
      await locker.query('commit');
      const results = await attempts;
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
      const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
      assert.equal(rejected.reason.code, 'identity_conflict');
      const winner = results.find(result => result.status === 'fulfilled') as PromiseFulfilledResult<Record<string, any>>;
      const persisted = await admin.from('growth_identity_links').select('*').eq('tenant_id', users[0]).eq('project_id', project).eq('anonymous_id', racing.anonymousId);
      assert.equal(persisted.error, null); assert.equal(persisted.data?.length, 1);
      assert.equal(persisted.data![0].user_id, winner.value.user_id);
    } finally {
      await locker.query('rollback'); await locker.end(); if (attempts) await attempts;
    }
  });
  test('real growth identity admission serializes project transfer and membership revocation without a stale write',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const users:string[]=[];let project:string|undefined;
    t.after(async()=>{
      if(project)assert.equal((await admin.from('projects').delete().eq('id',project)).error,null);
      for(const id of users)assert.equal((await admin.auth.admin.deleteUser(id)).error,null);
    });
    for(let i=0;i<3;i++){
      const user=await admin.auth.admin.createUser({email:`identity-scope-${randomUUID()}@example.invalid`,email_confirm:true});
      assert.equal(user.error,null);assert.ok(user.data.user);users.push(user.data.user.id);
    }
    const [owner,viewer,other]=users;
    const created=await admin.from('projects').insert({user_id:owner,name:'Identity admission fixture',type:'app'}).select('id').single();
    assert.equal(created.error,null);project=created.data!.id;
    assert.equal((await admin.from('operations_memberships').insert({user_id:owner,project_id:project,member_user_id:viewer,role:'viewer',created_by:owner})).error,null);
    const service=new GrowthService(admin);
    const own=await service.linkIdentity(owner,{projectId:project!,anonymousId:randomUUID(),evidenceReference:'fixture:owner'});
    const member=await service.linkIdentity(viewer,{projectId:project!,anonymousId:randomUUID(),evidenceReference:'fixture:member'});
    assert.equal(own.user_id,owner);assert.equal(member.user_id,viewer);
    const url=new URL(process.env.XB01_LOCAL_DATABASE_URL!);
    assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'54322');assert.equal(url.pathname,'/postgres');
    const locker=new pg.Client({connectionString:url.href,ssl:false}),writer=new pg.Client({connectionString:url.href,ssl:false});
    await locker.connect();await writer.connect();
    try{
      await writer.query("set statement_timeout='10s'");
      const wp=(await writer.query('select pg_backend_pid() pid')).rows[0].pid,lp=(await locker.query('select pg_backend_pid() pid')).rows[0].pid;
      const roles=['viewer','operator','release_manager','recovery_manager','admin'];
      for(const scenario of [
        {actor:owner,sql:'update public.projects set user_id=$1 where id=$2',values:[other,project]},
        {actor:viewer,sql:'delete from public.operations_memberships where member_user_id=$1 and project_id=$2',values:[viewer,project]},
      ]){
        const anonymous=randomUUID();await locker.query('begin');await locker.query(scenario.sql,scenario.values);
        const pending=writer.query('select public.link_growth_identity($1,$2,$3,$4,$5,$6)',[scenario.actor,owner,project,anonymous,'fixture:stale',roles]);
        void pending.catch(()=>{});let blocked=false;
        for(let i=0;i<150;i++){
          if((await locker.query('select pg_blocking_pids($1) blockers',[wp])).rows[0].blockers.includes(lp)){blocked=true;break;}
          await new Promise(resolve=>setTimeout(resolve,20));
        }
        assert.equal(blocked,true,'Observed actual current project/member row lock');await locker.query('commit');
        await assert.rejects(pending,{code:'42501'});
        assert.equal((await writer.query('select id from public.growth_identity_links where anonymous_id=$1',[anonymous])).rowCount,0);
        if(scenario.actor===owner)await locker.query('update public.projects set user_id=$1 where id=$2',[owner,project]);
      }
      for(const role of ['anon','authenticated']){
        await writer.query('begin');await writer.query(`set local role ${role}`);
        await assert.rejects(writer.query('select public.link_growth_identity($1,$2,$3,$4,$5,$6)',[owner,owner,project,randomUUID(),'fixture:browser',roles]),{code:'42501'});
        await writer.query('rollback');
      }
      const saved=await admin.from('growth_identity_links').select('id,user_id,evidence_reference').in('id',[own.id,member.id]).order('id');
      assert.equal(saved.error,null);assert.deepEqual(saved.data,[
        {id:own.id,user_id:owner,evidence_reference:'fixture:owner'},
        {id:member.id,user_id:viewer,evidence_reference:'fixture:member'},
      ].sort((a,b)=>a.id.localeCompare(b.id)));
    }finally{await locker.query('rollback');await writer.query('rollback');await writer.end();await locker.end();}
  });
}
