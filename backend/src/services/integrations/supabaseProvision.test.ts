import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
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
    const transport=t.mock.method(globalThis,'fetch',async()=>{throw new Error('unexpected network');});
    await assert.rejects(ensureStorageBuckets('http://abcdxyz.supabase.co','fixture-key'),/Invalid/);
    await assert.rejects(ensureStorageBuckets('https://abcdxyz.supabase.co','fixture-key',['../foreign']),/Invalid/);
    assert.equal(transport.mock.callCount(),0);
  });

  it('existing public or unknown buckets cannot be reported private and are never silently changed',async(t)=>{
    for(const visibility of [true,undefined]){
      const requests:string[]=[];
      const transport=t.mock.method(globalThis,'fetch',async(...[input,init]:Parameters<typeof fetch>)=>{
        requests.push(init?.method??'GET');
        assert.equal(new URL(String(input)).pathname,'/storage/v1/bucket');
        return Response.json([{id:'xroga-uploads',public:visibility}]);
      });
      await assert.rejects(ensureStorageBuckets('https://abcdxyz.supabase.co','fixture-key'),/privacy could not be verified/);
      assert.deepEqual(requests,['GET']);transport.mock.restore();
    }
  });

  it('new or concurrently created buckets require an independent private postcondition',async(t)=>{
    for(const createStatus of [200,409]) for(const privateAfter of [true,false]){
      let reads=0;const calls:string[]=[];
      const transport=t.mock.method(globalThis,'fetch',async(...[_input,init]:Parameters<typeof fetch>)=>{
        const method=init?.method??'GET';calls.push(method);
        if(method==='POST'){
          assert.equal(JSON.parse(String(init?.body)).public,false);
          return Response.json(createStatus===200?{name:'xroga-uploads'}:{message:'already exists'},{status:createStatus});
        }
        return Response.json(++reads===1?[]:[{id:'xroga-uploads',public:!privateAfter}]);
      });
      const result=ensureStorageBuckets('https://abcdxyz.supabase.co','fixture-key');
      if(privateAfter)assert.deepEqual(await result,['xroga-uploads']);
      else await assert.rejects(result,/privacy could not be verified/);
      assert.deepEqual(calls,['GET','POST','GET']);transport.mock.restore();
    }
  });

  it('storage discovery failure never creates a bucket or leaks the provider payload',async(t)=>{
    const transport=t.mock.method(globalThis,'fetch',async()=>Response.json({message:'PRIVATE_PROVIDER_CANARY'},{status:403}));
    await assert.rejects(ensureStorageBuckets('https://abcdxyz.supabase.co','fixture-key'),error=>{
      assert.ok(error instanceof Error);assert.match(error.message,/access could not be verified/);assert.doesNotMatch(error.message,/CANARY/);return true;
    });
    assert.equal(transport.mock.callCount(),1);
  });

  it('partial setup is not successful provisioning and does not expose raw schema errors',async(t)=>{
    for(const schemaOk of [false,true]){
      const transport=t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0])=>{
        const url=new URL(String(input));
        if(url.hostname==='api.supabase.com')return Response.json(schemaOk?[]:{message:'PRIVATE_SQL_CANARY'},{status:schemaOk?200:500});
        return Response.json([{id:'xroga-uploads',public:schemaOk},{id:'abcdxyz-uploads',public:schemaOk}]);
      });
      const result=await provisionUserSupabase({projectUrl:'https://abcdxyz.supabase.co',serviceRoleKey:'fixture-key',accessToken:'fixture-token'});
      assert.equal(result.ok,false);assert.equal(result.schemaApplied,schemaOk);
      assert.equal(result.memoryTablesReady,schemaOk);assert.doesNotMatch(JSON.stringify(result),/CANARY/);
      assert.match(result.message,schemaOk?/Schema and memory tables were saved/:/Private storage is ready/);
      transport.mock.restore();
    }
  });
});
