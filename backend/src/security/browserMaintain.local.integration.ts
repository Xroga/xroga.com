import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';

export function registerBrowserMaintainTests():void {
  test('real PostgreSQL browser maintenance correction preserves DML and removes MAINTAIN on current and future migration-owned tables',async()=>{
    if(process.env.CI!=='true'||process.env.XB01_DISPOSABLE_SUPABASE!=='1')throw Error('Disposable CI required');
    const target=new URL(process.env.XB01_LOCAL_DATABASE_URL??'');
    assert.equal(target.hostname,'127.0.0.1');assert.equal(target.port,'54322');assert.equal(target.pathname,'/postgres');
    const db=new pg.Client({connectionString:target.href,ssl:false});await db.connect();
    try {
      await db.query('create table public.xroga_p3_maintain_fixture(id int primary key);grant select,insert,update,delete,maintain on public.xroga_p3_maintain_fixture to authenticated;');
      const privilege=async(name:string)=>(await db.query("select has_table_privilege('authenticated','public.xroga_p3_maintain_fixture',$1) as allowed",[name])).rows[0].allowed;
      assert.equal(await privilege('MAINTAIN'),true);
      await db.query(readFileSync(new URL('../../../supabase/migrations/20261024111128_browser_maintain_privilege.sql',import.meta.url),'utf8'));
      assert.equal(await privilege('MAINTAIN'),false);
      for(const name of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal(await privilege(name),true);
      await db.query('create table public.xroga_p3_maintain_future_fixture(id int)');
      assert.equal((await db.query("select has_table_privilege('authenticated','public.xroga_p3_maintain_future_fixture','MAINTAIN') as allowed")).rows[0].allowed,false);
      const {rows}=await db.query(`select count(*)::int as count from pg_class c join pg_namespace n on n.oid=c.relnamespace
        cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a left join pg_roles r on r.oid=a.grantee
        where n.nspname='public' and c.relkind in ('r','p') and coalesce(r.rolname,'PUBLIC') in ('PUBLIC','anon','authenticated') and a.privilege_type='MAINTAIN'`);
      assert.equal(rows[0].count,0);
    } finally {await db.query('drop table if exists public.xroga_p3_maintain_future_fixture;drop table if exists public.xroga_p3_maintain_fixture');await db.end();}
  });
}
