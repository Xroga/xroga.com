import {withSupabaseSourceFixture} from './__tests__/supabaseSourceFixture.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {createTenantContext} from '../../security/tenantContext.js';
const context=createTenantContext({userId:'11111111-1111-4111-8111-111111111111',via:'remote_getuser'});
import {
  buildUserSupabaseProvisionSql,
  projectRefFromUrl,
  ensureStorageBuckets,
  provisionUserSupabase,
} from './supabaseProvision.js';

describe('supabaseProvision', () => {
  it('parses project ref from URL', () => {
    assert.equal(projectRefFromUrl('https://abcdxyz.supabase.co'), 'abcdxyz');
    assert.equal(projectRefFromUrl('https://abcdxyz.supabase.co/'), 'abcdxyz');
    assert.equal(projectRefFromUrl('not-a-url'), null);
    for (const value of ['http://abcdxyz.supabase.co','https://user:pass@abcdxyz.supabase.co',
      'https://abcdxyz.supabase.co:8443','https://abcdxyz.supabase.co/path',
      'https://abcdxyz.supabase.co?redirect=other','https://abcdxyz.supabase.co#fragment',
      'https://abcdxyz.supabase.co.attacker.invalid','https://127.0.0.1']) assert.equal(projectRefFromUrl(value),null,value);
  });

  it('builds provision SQL with memory + app tables', () => {
    const sql = buildUserSupabaseProvisionSql({ projectName: 'Acme App', includeStorage: true });
    assert.match(sql, /xroga_project_memory/);
    assert.match(sql, /xroga_session_memory/);
    assert.match(sql, /xroga_user_id/);
    assert.match(sql, /public\.profiles/);
    assert.match(sql, /app_items/);
    assert.match(sql, /xroga-uploads/);
    assert.match(sql, /enable row level security/i);
    assert.match(sql, /xroga_uploads_select_own/);
    assert.match(sql, /storage\.objects/);
    for (const table of ['xroga_project_memory','xroga_session_memory']) {
      assert.ok(sql.includes(`alter table public.${table} enable row level security`));
      assert.ok(sql.includes(`revoke all on table public.${table} from public, anon, authenticated`));
      assert.ok(sql.includes(`create policy xroga_memory_server_only on public.${table} as restrictive`));
    }
  });

  it('rejects unsafe project endpoints and bucket IDs before any network request',async(t)=>{
    const transport=t.mock.method(globalThis,'fetch',withSupabaseSourceFixture(t,context,async()=>{throw new Error('unexpected network');}));
    await assert.rejects(ensureStorageBuckets('http://abcdxyz.supabase.co','fixture-key',['xroga-uploads'],context),/Invalid/);
    await assert.rejects(ensureStorageBuckets('https://abcdxyz.supabase.co','fixture-key',['../foreign'],context),/Invalid/);
    assert.equal(transport.mock.callCount(),0);
  });

  it('existing public or unknown buckets cannot be reported private and are never silently changed',async(t)=>{
    for(const visibility of [true,undefined]){
      const requests:string[]=[];
      const transport=t.mock.method(globalThis,'fetch',withSupabaseSourceFixture(t,context,async(...[input,init]:Parameters<typeof fetch>)=>{
        requests.push(init?.method??'GET');
        assert.equal(new URL(String(input)).pathname,'/storage/v1/bucket');
        return Response.json([{id:'xroga-uploads',public:visibility}]);
      }));
      await assert.rejects(ensureStorageBuckets('https://abcdxyz.supabase.co','fixture-key',['xroga-uploads'],context),/privacy could not be verified/);
      assert.deepEqual(requests,['GET']);transport.mock.restore();
    }
  });

  it('missing private buckets require native approval before creation',async t=>{
    const calls:string[]=[];
    t.mock.method(globalThis,'fetch',withSupabaseSourceFixture(t,context,async(_input,init)=>{calls.push(init?.method??'GET');return Response.json([]);}));
    await assert.rejects(ensureStorageBuckets('https://abcdxyz.supabase.co','fixture-key',['xroga-uploads'],context),{code:'SUPABASE_PROVISION_ADMISSION_DENIED'});
    assert.deepEqual(calls,['GET']);
    // All original 200/409 and private/public postcondition combinations now
    // execute with actual canonical permits in supabaseProvision.authority.test.ts.
  });

  it('storage discovery failure never creates a bucket or leaks the provider payload',async(t)=>{
    const transport=t.mock.method(globalThis,'fetch',withSupabaseSourceFixture(t,context,async()=>Response.json({message:'PRIVATE_PROVIDER_CANARY'},{status:403})));
    await assert.rejects(ensureStorageBuckets('https://abcdxyz.supabase.co','fixture-key',['xroga-uploads'],context),error=>{
      assert.ok(error instanceof Error);assert.match(error.message,/denied by security policy/);assert.doesNotMatch(error.message,/CANARY/);return true;
    });
    assert.equal(transport.mock.calls.filter(call=>new URL(String(call.arguments[0])).hostname==='abcdxyz.supabase.co').length,1);
  });

  it('raw provisioning values cannot override missing canonical account credentials',async t=>{
    let provider=0;
    t.mock.method(globalThis,'fetch',withSupabaseSourceFixture(t,context,async()=>{provider++;return Response.json({message:'PRIVATE_SQL_CANARY'});}));
    await assert.rejects(provisionUserSupabase({userId:context.userId,tenantContext:context,projectUrl:'https://abcdxyz.supabase.co',serviceRoleKey:'fixture-key',accessToken:'fixture-token'}),error=>{
      assert.equal((error as {code:string}).code,'SUPABASE_PROVISION_ADMISSION_DENIED');assert.doesNotMatch(String(error),/CANARY/);return true;
    });
    assert.equal(provider,0);
    // Partial schema, RLS and storage failures now retain failure under the
    // actual native confirmation executor, rather than bypassing its authority.
  });
});
