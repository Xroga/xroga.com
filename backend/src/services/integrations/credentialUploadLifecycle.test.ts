import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { saveUserProviderKey, getUserProviderKey } from './userProviderKeys.js';

test('canonical BYOK writer seals before private upload and revalidates ownership/revision after bucket waits', async t => {
  const keys=['NODE_ENV','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'],old=keys.map(k=>process.env[k]);
  Object.assign(process.env,{NODE_ENV:'test',SUPABASE_URL:'http://127.0.0.1:55439',SUPABASE_SERVICE_ROLE_KEY:'synthetic-only'});
  t.after(()=>keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];}));
  const user=randomUUID(),provider='apikey_openai',secret='SYNTHETIC_PRIVATE_UPLOAD_SECRET';
  let mode='ok', uploads=0, row: Record<string,any>|null=null, stored='',reads=0;
  const logs: string[]=[];
  t.mock.method(console,'warn',(...args: unknown[])=>logs.push(args.join(' ')));
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    const url=new URL(String(input));assert.equal(url.origin,process.env.SUPABASE_URL);
    const body=init?.body?JSON.parse(String(init.body)):{};
    if(url.pathname.endsWith('/prepare_provider_key_write'))return Response.json(randomUUID());
    if(url.pathname.endsWith('/save_provider_key_if_current')){
      assert.equal(body.p_owner_id,user);assert.equal(body.p_provider,provider);
      assert.match(body.p_access_token,/^vault:v3:/);assert.ok(!body.p_access_token.includes(secret));
      row={user_id:user,provider,access_token:body.p_access_token,metadata:body.p_metadata,credential_revision:randomUUID()};
      return Response.json(true);
    }
    if(url.pathname==='/rest/v1/user_integrations'){
      reads++;assert.equal(url.searchParams.get('user_id'),'eq.'+user);assert.equal(url.searchParams.get('provider'),'eq.'+provider);
      return Response.json(row);
    }
    if(url.pathname==='/storage/v1/bucket'){
      if(mode==='rotate')row={...row,credential_revision:randomUUID()};
      if(mode==='revoke')row={...row,metadata:{...row?.metadata,revoked:true}};
      if(mode==='foreign')row={...row,user_id:randomUUID()};
      return Response.json([{id:'xroga-github-tokens',public:mode==='public'}]);
    }
    assert.equal(url.pathname,'/storage/v1/object/xroga-github-tokens/'+user+'/vault-'+provider+'.json');
    assert.equal(init?.method,'POST');uploads++;stored=String(init?.body);
    assert.match(body.access_token,/^vault:v3:/);assert.ok(!stored.includes(secret));
    if(mode==='duringUpload')row={...row,metadata:{...row?.metadata,revoked:true}};
    if(mode==='uploadError')return Response.json({message:secret,error:secret,statusCode:'403'},{status:403});
    return Response.json({Key:user+'/vault-'+provider+'.json'});
  });
  for(const scenario of ['ok','rotate','revoke','foreign','public','duringUpload','uploadError']){
    mode=scenario;uploads=0;reads=0;stored='';
    assert.equal((await saveUserProviderKey(user,'openai',secret)).connected,true,'Canonical save remains authoritative when optional mirror fails');
    await new Promise<void>(resolve=>setImmediate(resolve));
    assert.equal(uploads,['ok','duringUpload','uploadError'].includes(mode)?1:0,scenario);
    assert.ok(reads>=1);
    if(mode==='ok')assert.equal(await getUserProviderKey(user,'openai'),secret);
    if(mode==='duringUpload')assert.equal(await getUserProviderKey(user,'openai'),null,'A stale encrypted mirror cannot revive revoked authority');
  }
  assert.ok(logs.every(line=>!line.includes(secret)),'Provider diagnostics cannot copy the credential into logs');
});
