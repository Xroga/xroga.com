import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {prepareSupabaseBundleWrite,readUserSupabaseBundle,saveSupabaseBundle} from './userProviderKeys.js';

test('provisioning bundle reads never restore missing canonical credentials from private mirrors',async t=>{
  const owner='11111111-1111-4111-8111-111111111111';
  const original=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL='https://bundle-authority.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-only';
  t.after(()=>{globalThis.fetch=original;oldUrl===undefined?delete process.env.SUPABASE_URL:process.env.SUPABASE_URL=oldUrl;oldKey===undefined?delete process.env.SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;});
  const jwt=(role:string)=>`e30.${Buffer.from(JSON.stringify({ref:'fixtureproject',role})).toString('base64url')}.synthetic`;
  const values:Record<string,string>={supabase_url:'https://fixtureproject.supabase.co',supabase_anon:jwt('anon'),supabase:jwt('service_role')};
  const rows=new Map(Object.entries(values).map(([name,value])=>[`apikey_${name}`,{user_id:owner,provider:`apikey_${name}`,access_token:'enc:'+Buffer.from(`fixture:${value}`).toString('base64'),metadata:{},credential_revision:randomUUID()}]));
  const mirrors=new Map(rows);let storageReads=0,writes=0;
  globalThis.fetch=async(input)=>{
    const url=new URL(String(input instanceof Request?input.url:input));assert.equal(url.origin,'https://bundle-authority.invalid');
    if(url.pathname==='/rest/v1/user_integrations'){assert.equal(url.searchParams.get('user_id'),`eq.${owner}`);const selection=url.searchParams.get('provider');return Response.json(selection?.startsWith('eq.')?rows.get(selection.slice(3))??null:[...rows.values()]);}
    if(url.pathname.includes('/storage/')){
      storageReads++;const provider=url.pathname.split('/').at(-1)!.replace(/^vault-/,'').replace(/\.json$/,'');
      return mirrors.has(provider)?Response.json(mirrors.get(provider)):Response.json({code:'NoSuchKey',message:'Synthetic missing object'}, {status:400});
    }
    writes++;throw new Error('No persistence or provider operation is authorized by this read fixture');
  };
  assert.equal((await readUserSupabaseBundle(owner))?.serviceRoleKey,values.supabase,'Matching active legacy database grants remain supported');
  rows.clear();storageReads=0;
  assert.equal(await readUserSupabaseBundle(owner),null,'Storage possession cannot restore absent database authority');
  assert.equal(storageReads,0,'Normal provisioning reads must not consult orphan mirrors');
  rows.set('apikey_supabase_url',mirrors.get('apikey_supabase_url')!);rows.set('apikey_supabase_anon',mirrors.get('apikey_supabase_anon')!);
  const partial=await readUserSupabaseBundle(owner);assert.ok(partial);assert.equal(partial.serviceRoleKey,null,'An active public URL/anon pair cannot restore an absent privileged key');
  assert.equal(storageReads,0);
  rows.clear();const reconnect=await prepareSupabaseBundleWrite(owner);assert.ok(storageReads>0,'Explicit reconnect still checks legacy data without mutating it');
  await assert.rejects(saveSupabaseBundle(reconnect,{projectUrl:values.supabase_url!,anonKey:values.supabase_anon!}),/Disconnect/);
  assert.equal(writes,0,'A public anon key cannot turn an orphan mirror into new privileged authority');
});
