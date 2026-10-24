import assert from 'node:assert/strict';
import test from 'node:test';
import { deleteUserProviderKey } from './userProviderKeys.js';
import { createTenantContext } from '../../security/tenantContext.js';

test('bulk custom revocation enumerates all names without downloading secrets and fails closed on incomplete listing',async()=>{
  const context=createTenantContext({userId:'11111111-1111-4111-8111-111111111111',via:'remote_getuser'});
  const previous={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY};
  process.env.SUPABASE_URL='http://127.0.0.1:49191';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-only';
  const original=globalThis.fetch;
  let mode='success';
  const pages:number[]=[],databasePages:number[]=[],revoked:string[]=[],removed:string[]=[];
  const databaseProviders=Array.from({length:100},(_,index)=>`apikey_custom_key${String(index).padStart(3,'0')}`).concat('apikey_custom_one');
  const firstPage=Array.from({length:99},(_,index)=>({name:`aaa-${String(index).padStart(3,'0')}.txt`}))
    .concat([{name:'vault-apikey_custom_one.json'}]);
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input instanceof Request?input.url:input));
    assert.equal(url.origin,process.env.SUPABASE_URL);
    const body=JSON.parse(String(init?.body??'{}'));
    if(url.pathname==='/rest/v1/user_integrations') {
      assert.equal(url.searchParams.get('user_id'),`eq.${context.userId}`);
      assert.equal(url.searchParams.get('select'),'user_id,provider');
      assert.equal(url.searchParams.get('order'),'provider.asc');
      assert.equal(url.searchParams.get('limit'),'100');
      assert.match(new Headers(init?.headers).get('prefer')??'',/count=exact/);
      const offset=Number(url.searchParams.get('offset'));databasePages.push(offset);
      if(mode==='db-outage'&&offset===100)return Response.json({message:'PRIVATE_DATABASE_CANARY'},{status:503});
      const total=mode==='empty'?0:mode==='db-limit'?10001:mode==='db-count-change'&&offset===100?102:
        ['foreign-category','db-foreign-owner','db-malformed'].includes(mode)?1:101;
      let rows:unknown=databaseProviders.slice(offset,offset+100).map(provider=>({user_id:context.userId,provider}));
      if(mode==='empty')rows=[];
      if(mode==='foreign-category')rows=[{user_id:context.userId,provider:'apikey_openai'}];
      if(mode==='db-foreign-owner')rows=[{user_id:'22222222-2222-4222-8222-222222222222',provider:'apikey_custom_foreign'}];
      if(mode==='db-repeat'&&offset===100)rows=[{user_id:context.userId,provider:databaseProviders[0]}];
      if(mode==='db-malformed')rows={rows:[]};
      if(mode==='db-truncated')rows=[{user_id:context.userId,provider:'apikey_custom_one'}];
      return Response.json(rows,mode==='db-missing-count'?{}:{headers:{'Content-Range':`${offset}-${offset+99}/${total}`}});
    }
    if(url.pathname==='/storage/v1/object/list/xroga-github-tokens') {
      assert.equal(body.prefix,context.userId);assert.equal(body.limit,100);
      assert.deepEqual(body.sortBy,{column:'name',order:'asc'});pages.push(body.offset);
      if(mode==='empty')return Response.json([]);
      if(mode==='outage')return Response.json({message:'PRIVATE_STORAGE_CANARY'},{status:503});
      if(mode==='throw')throw new Error('PRIVATE_STORAGE_CANARY');
      if(mode==='malformed')return Response.json({files:[]});
      if(mode==='invalid-name')return Response.json([{name:'vault-apikey_custom_../foreign.json'}]);
      if(mode==='limit')return Response.json(Array.from({length:100},(_,index)=>({name:`item-${body.offset+index}`})));
      if(body.offset===0||mode==='repeat')return Response.json(firstPage);
      assert.equal(body.offset,100);return Response.json([{name:'vault-apikey_custom_two.json'}]);
    }
    if(url.pathname==='/rest/v1/rpc/revoke_provider_key') {
      assert.deepEqual(databasePages,[0,100],'Database inventory is complete before first mutation');
      assert.deepEqual(pages,[0,100],'Storage inventory is complete before first mutation');
      assert.equal(body.p_owner_id,context.userId);revoked.push(body.p_provider);return Response.json(true);
    }
    if(url.pathname==='/storage/v1/object/xroga-github-tokens' && init?.method==='DELETE') {
      removed.push(...body.prefixes);return Response.json([]);
    }
    throw new Error(`Unexpected request, including forbidden credential download: ${url.pathname}`);
  };
  try {
    await deleteUserProviderKey(context,'custom');
    assert.deepEqual(databasePages,[0,100]);
    assert.deepEqual(pages,[0,100]);
    assert.deepEqual(revoked,[...databaseProviders,'apikey_custom_two'],'Rows appearing in both sources are revoked once');
    assert.deepEqual(removed,revoked.map(provider=>`${context.userId}/vault-${provider}.json`));
    mode='empty';pages.length=0;databasePages.length=0;revoked.length=0;removed.length=0;
    await deleteUserProviderKey(context,'custom');
    assert.deepEqual(databasePages,[0]);assert.deepEqual(pages,[0]);assert.deepEqual(revoked,[]);assert.deepEqual(removed,[]);
    for(mode of ['outage','throw','malformed','invalid-name','repeat','limit','foreign-category',
      'db-outage','db-malformed','db-foreign-owner','db-repeat','db-limit','db-count-change','db-missing-count','db-truncated']) {
      pages.length=0;databasePages.length=0;revoked.length=0;removed.length=0;
      await assert.rejects(deleteUserProviderKey(context,'custom'),error=>{
        assert.ok(error instanceof Error);assert.match(error.message,/credential/i);assert.doesNotMatch(error.message,/CANARY/);return true;
      });
      assert.deepEqual(revoked,[]);assert.deepEqual(removed,[]);
      if(mode==='limit')assert.equal(pages.length,100);
    }
  } finally {
    globalThis.fetch=original;
    if(previous.url===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=previous.url;
    if(previous.key===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=previous.key;
  }
});
