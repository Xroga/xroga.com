import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { prepareSupabaseBundleWrite, readUserSupabaseBundle, saveSupabaseBundle, resolveProviderEnvForDeploy } from './userProviderKeys.js';

test('manual provisioning and worker provisioning use one bundle snapshot',()=>{
  const route=readFileSync(new URL('../../routes/integrations.ts',import.meta.url),'utf8');
  const worker=readFileSync(new URL('../../ai/pipeline.ts',import.meta.url),'utf8');
  assert.match(route,/const bundle = await readUserSupabaseBundle\(req\.userId!\)/);
  assert.match(worker,/const bundle = await readUserSupabaseBundle\(opts\.userId\)/);
  assert.doesNotMatch(route,/getUserProviderKey\(\s*req\.userId!,\s*'supabase(?:_url|_db_password)?'/);
  assert.doesNotMatch(worker,/getUserProviderKey\(\s*opts\.userId,\s*'supabase(?:_url|_db_password)?'/);
});

test('bundle reads preserve consistent legacy JWTs and deny opaque, mixed and changed associations', async () => {
  const owner = '11111111-1111-4111-8111-111111111111';
  const originalFetch = globalThis.fetch;
  const names = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'USER_SECRETS_ENCRYPTION_KEY'];
  const before = names.map(name => process.env[name]);
  process.env.SUPABASE_URL = 'https://bundle-fixture.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-key';
  process.env.USER_SECRETS_ENCRYPTION_KEY = 'synthetic-encryption-key';
  const jwt = (ref: string, role: string) => `e30.${Buffer.from(JSON.stringify({ref,role})).toString('base64url')}.synthetic`;
  const enc = (plain: string) => `enc:${Buffer.from(`fixture:${plain}`).toString('base64')}`;
  const rows = new Map<string, any>();
  const mirrors = new Map<string, any>();
  let writes = 0, storageOutage = false;
  let missingCode = '404';
  const put = (provider: string, value: string) => rows.set(`apikey_${provider}`, {user_id:owner,provider:`apikey_${provider}`,access_token:enc(value),metadata:{},credential_revision:randomUUID()});
  globalThis.fetch = async(input,init) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    assert.equal(url.origin, 'https://bundle-fixture.invalid');
    const reply = (value: unknown, status = 200) => Response.json(value, {status});
    if (url.pathname === '/rest/v1/user_integrations') {
      assert.equal(url.searchParams.get('user_id'),`eq.${owner}`);
      return reply([...rows.values()]);
    }
    if (url.pathname.includes('/storage/')) {
      if(storageOutage)return reply({message:'synthetic unavailable'},503);
      const provider = url.pathname.split('/').at(-1)!.replace(/^vault-/,'').replace(/\.json$/,'');
      return mirrors.has(provider) ? reply(mirrors.get(provider)) : reply({code:missingCode,message:'Synthetic storage outcome'},400);
    }
    assert.ok(url.pathname.endsWith('/save_supabase_bundle_if_current'));
    writes++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.p_owner_id,owner);
    if(!body.p_rows.every((r:any)=>(rows.get(r.provider)?.credential_revision??null)===r.revision))return reply(false);
    const generation = randomUUID();
    for(const row of body.p_rows) rows.set(row.provider,{...row,user_id:owner,credential_revision:randomUUID(),metadata:row.access_token?{...row.metadata,supabase_bundle_id:generation,supabase_project_ref:body.p_project_ref}:{revoked:true}});
    return reply(true);
  };
  try {
    put('supabase_url','https://oldproject.supabase.co');
    put('supabase_anon',jwt('oldproject','anon')); put('supabase',jwt('oldproject','service_role'));
    assert.equal((await readUserSupabaseBundle(owner))?.serviceRoleKey,jwt('oldproject','service_role'));
    rows.get('apikey_supabase').access_token=enc(jwt('otherproject','service_role'));
    assert.equal(await readUserSupabaseBundle(owner),null);
    put('supabase','sb_secret_SYNTHETIC_OPAQUE');
    assert.equal(await readUserSupabaseBundle(owner),null);
    const old = await prepareSupabaseBundleWrite(owner);
    await assert.rejects(saveSupabaseBundle(old,{projectUrl:'https://newproject.supabase.co',anonKey:'sb_publishable_SYNTHETIC'}),/Disconnect/);
    assert.equal(writes,0);
    const explicit={projectUrl:'https://newproject.supabase.co',anonKey:'sb_publishable_SYNTHETIC',serviceRoleKey:'sb_secret_SYNTHETIC_NEW'};
    await saveSupabaseBundle(old,explicit);
    assert.equal((await readUserSupabaseBundle(owner))?.serviceRoleKey,explicit.serviceRoleKey);
    const a=await prepareSupabaseBundleWrite(owner),b=await prepareSupabaseBundleWrite(owner);
    await saveSupabaseBundle(a,explicit);
    await assert.rejects(saveSupabaseBundle(b,explicit),{code:'CREDENTIAL_WRITE_CONFLICT'});
    await assert.rejects(saveSupabaseBundle({...a},explicit),{code:'CREDENTIAL_WRITE_CONFLICT'});
    rows.get('apikey_supabase').metadata={};
    assert.equal(await readUserSupabaseBundle(owner),null,'Individual save invalidates shared binding');
    await assert.rejects(resolveProviderEnvForDeploy(owner),/not associated/);
    rows.clear();
    for(const [p,value] of [['supabase_url','https://oldproject.supabase.co'],['supabase_anon',jwt('oldproject','anon')],['supabase',jwt('oldproject','service_role')]]) {
      mirrors.set(`apikey_${p}`,{access_token:enc(value),metadata:{}});
    }
    assert.equal(await readUserSupabaseBundle(owner),null,'Orphan mirrors are not canonical provisioning authority');
    const legacyAdmission=await prepareSupabaseBundleWrite(owner);
    assert.equal(rows.size,0,'Admission never masks legacy mirrors with tombstones');
    await assert.rejects(saveSupabaseBundle(legacyAdmission,{projectUrl:'https://newproject.supabase.co',anonKey:'SYNTHETIC_ANON'}),/Disconnect/);
    mirrors.get('apikey_supabase').access_token=enc('sb_secret_SYNTHETIC_UNBOUND');
    assert.equal(await readUserSupabaseBundle(owner),null);
    storageOutage=true;
    await assert.rejects(prepareSupabaseBundleWrite(owner),/could not be checked/);
    storageOutage=false;mirrors.clear();
    for(const code of ['404','NoSuchKey','NoSuchBucket']) {
      missingCode=code;await prepareSupabaseBundleWrite(owner);assert.equal(rows.size,0);
    }
    for(const code of ['AccessDenied','InvalidJWT','400','500']) {
      missingCode=code;await assert.rejects(prepareSupabaseBundleWrite(owner),/could not be checked/);
    }
  } finally {
    globalThis.fetch=originalFetch;
    names.forEach((name,index)=>{if(before[index]===undefined)delete process.env[name];else process.env[name]=before[index];});
  }
});
