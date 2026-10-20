import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { deleteUserProviderKey, getUserProviderKey, prepareUserProviderKeyWrite, saveUserProviderKey } from './userProviderKeys.js';
import { oneClickConnectSupabase, prepareSupabaseConnectionWrite } from './supabaseProvision.js';
import { readFileSync } from 'node:fs';
import { createTenantContext } from '../../security/tenantContext.js';
import { ensureExpoProjectLinked } from '../publish/easPublish.js';

test('BYOK save carries its admitted revision, rejects a concurrent revoke and permits a fresh reconnect',async()=>{
  let revision=randomUUID(),revoked=true,mode='race';
  let deferredSave:(()=>void)|undefined;
  let admittedResolve:()=>void=()=>{};
  const admitted=new Promise<void>(resolve=>{admittedResolve=resolve;});
  const calls:Array<{path:string;body:Record<string,unknown>}>=[];
  const server=createServer((req,res)=>{
    let text='';req.on('data',chunk=>{text+=chunk;});req.on('end',()=>{
      const body=text?JSON.parse(text):{},path=req.url??'';calls.push({path,body});
      res.setHeader('Content-Type','application/json');
      if(path.endsWith('/prepare_provider_key_write')) {
        if(mode==='unavailable'){res.statusCode=404;res.end(JSON.stringify({code:'PGRST202',message:'fixture missing migration'}));}
        else res.end(JSON.stringify(revision));
      } else if(path.endsWith('/save_provider_key_if_current')) {
        const save=()=>{
          const accepted=body.p_revision===revision;
          if(accepted){revision=randomUUID();revoked=false;}
          res.end(JSON.stringify(accepted));
        };
        if(mode==='race'){deferredSave=save;admittedResolve();}else save();
      } else if(path.endsWith('/save_supabase_bundle_if_current')) {
        res.end(JSON.stringify(false));
      } else if(path.endsWith('/revoke_provider_key')) {
        revision=randomUUID();revoked=true;res.end('true');
      } else if(path==='/storage/v1/bucket') {
        res.end(JSON.stringify([{id:'xroga-github-tokens',name:'xroga-github-tokens',public:false}]));
      } else if(path.startsWith('/rest/v1/user_integrations?')) {
        const provider=new URL(path,'http://fixture').searchParams.get('provider');
        if(provider?.startsWith('in.')) {
          res.end(JSON.stringify(['supabase_url','supabase_anon','supabase','supabase_db_password'].map(name=>({
            user_id:'11111111-1111-4111-8111-111111111111',provider:`apikey_${name}`,access_token:'',metadata:{revoked:true},credential_revision:revision,
          }))));return;
        }
        const row=provider==='eq.apikey_expo'
          ?{user_id:'11111111-1111-4111-8111-111111111111',provider:'apikey_expo',access_token:'enc:'+Buffer.from('fixture:SYNTHETIC_EXPO_TOKEN').toString('base64'),metadata:{},credential_revision:revision}
          :{user_id:'11111111-1111-4111-8111-111111111111',provider:provider?.replace('eq.','')??'apikey_unknown',access_token:'',metadata:{revoked:true},credential_revision:revision};
        res.end(JSON.stringify([row]));
      } else if(path.startsWith('/storage/')) res.end('{}');
      else {res.statusCode=500;res.end(JSON.stringify({message:'unexpected fixture request'}));}
    });
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const names=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','USER_SECRETS_ENCRYPTION_KEY','DATABASE_URL','SUPABASE_DB_URL','SUPABASE_DB_PASSWORD'];
  const before=new Map(names.map(name=>[name,process.env[name]]));
  try {
    for(const name of names)delete process.env[name];
    process.env.SUPABASE_URL=`http://127.0.0.1:${address.port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-loopback-key';
    process.env.USER_SECRETS_ENCRYPTION_KEY='synthetic-encryption-fixture-not-a-secret';
    const user='11111111-1111-4111-8111-111111111111';
    const context=createTenantContext({userId:user,via:'remote_getuser'});
    const stale=saveUserProviderKey(user,'openai','SYNTHETIC_NEW_KEY');
    const denied=assert.rejects(stale,{code:'CREDENTIAL_WRITE_CONFLICT'});
    await admitted;
    await deleteUserProviderKey(context,'openai');
    assert.equal(revoked,true);assert.ok(deferredSave);deferredSave();await denied;
    assert.equal(revoked,true);
    assert.equal(calls.filter(call=>call.path.endsWith('/save_provider_key_if_current')).length,1,'Conflicts must not be retried against a fresh revision');
    assert.ok(!calls.some(call=>call.path.includes('/rest/v1/user_integrations')),'No fallback upsert');
    const saveCall=calls.find(call=>call.path.endsWith('/save_provider_key_if_current'))!;
    assert.equal(saveCall.body.p_owner_id,user);assert.equal(saveCall.body.p_provider,'apikey_openai');
    assert.match(String(saveCall.body.p_access_token),/^vault:v3:/);assert.ok(!String(saveCall.body.p_access_token).includes('SYNTHETIC_NEW_KEY'));
    assert.match(String((saveCall.body.p_metadata as Record<string,unknown>).vault_revision),/^[0-9a-f-]{36}$/i);
    mode='reconnect';
    const freshRevision=revision;
    assert.equal((await saveUserProviderKey(user,'openai','SYNTHETIC_FRESH_KEY')).connected,true);
    assert.equal(revoked,false);assert.notEqual(revision,freshRevision);
    const latest=calls.filter(call=>call.path.endsWith('/save_provider_key_if_current')).at(-1)!;
    assert.equal(latest.body.p_revision,freshRevision);
    await deleteUserProviderKey(context,'supabase_service');
    assert.equal(calls.filter(call=>call.path.endsWith('/revoke_provider_key')).at(-1)?.body.p_provider,'apikey_supabase_service');
    assert.equal(revoked,true);
    const aliasCalls=calls.length;
    await assert.rejects(saveUserProviderKey(user,'supabase_service','SYNTHETIC_UNSUPPORTED_KEY'));
    await assert.rejects(getUserProviderKey(user,'supabase_service'),{message:'Unsupported credential provider.'});
    for(const invalid of ['supabase_service_other','../supabase_service','apikey_supabase_service']) {
      await assert.rejects(deleteUserProviderKey(context,invalid),{message:'Unsupported credential provider.'});
    }
    assert.equal(calls.length,aliasCalls,'Delete-only alias must not widen other credential admission');
    const upstreamAdmission=await prepareUserProviderKeyWrite(user,'openai');
    await deleteUserProviderKey(context,'openai');
    const prepareCount=calls.filter(call=>call.path.endsWith('/prepare_provider_key_write')).length;
    await assert.rejects(saveUserProviderKey(user,'openai','SYNTHETIC_DELAYED_KEY',{writeAdmission:upstreamAdmission}),{code:'CREDENTIAL_WRITE_CONFLICT'});
    assert.equal(revoked,true);
    assert.equal(calls.filter(call=>call.path.endsWith('/prepare_provider_key_write')).length,prepareCount,'Delayed work must not reacquire admission');
    const saveCount=calls.filter(call=>call.path.endsWith('/save_provider_key_if_current')).length;
    for(const [owner,provider,admission]of [
      [user,'openai',{...upstreamAdmission}],
      ['22222222-2222-4222-8222-222222222222','openai',upstreamAdmission],
      [user,'anthropic',upstreamAdmission],
    ] as const) {
      await assert.rejects(saveUserProviderKey(owner,provider,'SYNTHETIC_UNBOUND_KEY',{writeAdmission:admission}),{code:'CREDENTIAL_WRITE_CONFLICT'});
    }
    assert.equal(calls.filter(call=>call.path.endsWith('/save_provider_key_if_current')).length,saveCount,'Forged and mismatched handles never reach persistence');
    const originalFetch=globalThis.fetch;
    let managementCalls=0;
    globalThis.fetch=async(input,init)=>{
      const url=String(input instanceof Request?input.url:input);
      if(url.startsWith(process.env.SUPABASE_URL!))return originalFetch(input,init);
      assert.equal(url,'https://api.supabase.com/v1/projects/fixtureproject/api-keys?reveal=true');
      managementCalls++;
      assert.equal(calls.filter(call=>call.path.endsWith('/prepare_provider_key_write')).at(-1)?.body.p_provider,'apikey_supabase_pat');
      await deleteUserProviderKey(context,'supabase_url');
      return new Response(JSON.stringify([{name:'anon',api_key:'SYNTHETIC_ANON_KEY'},{name:'service_role',api_key:'SYNTHETIC_SERVICE_KEY'}]),{status:200});
    };
    try {
      await assert.rejects(oneClickConnectSupabase({userId:user,accessToken:'SYNTHETIC_PAT',projectRef:'fixtureproject'}),{code:'CREDENTIAL_WRITE_CONFLICT'});
      assert.equal(managementCalls,1);
      assert.equal(revoked,true,'Remote key lookup completion cannot undo revocation');
      const writeAdmissions = await prepareSupabaseConnectionWrite(user);
      await deleteUserProviderKey(context, 'supabase_url');
      const beforeDelayed = calls.filter(call => call.path.endsWith('/prepare_provider_key_write')).length;
      const options = {userId:user,accessToken:'SYNTHETIC_PAT',projectRef:'fixtureproject',writeAdmissions};
      globalThis.fetch = async(input,init) => {
        const url=String(input instanceof Request?input.url:input);
        if(url.startsWith(process.env.SUPABASE_URL!))return originalFetch(input,init);
        assert.equal(url,'https://api.supabase.com/v1/projects/fixtureproject/api-keys?reveal=true');
        options.userId='22222222-2222-4222-8222-222222222222';
        options.projectRef='foreignproject';
        return Response.json([{name:'anon',api_key:'SYNTHETIC_ANON_KEY'},{name:'service_role',api_key:'SYNTHETIC_SERVICE_KEY'}]);
      };
      await assert.rejects(oneClickConnectSupabase(options), {code:'CREDENTIAL_WRITE_CONFLICT'});
      assert.equal(calls.filter(call => call.path.endsWith('/prepare_provider_key_write')).length,beforeDelayed,
        'A delayed OAuth callback cannot acquire a new admission after disconnect');
      assert.equal(calls.filter(call => call.path.endsWith('/save_supabase_bundle_if_current')).at(-1)?.body.p_owner_id,user,
        'Mutable caller options cannot change the admitted owner during project lookup');
      await assert.rejects(saveUserProviderKey(user,'supabase_pat','SYNTHETIC_PAT',{writeAdmission:writeAdmissions.pat}),{code:'CREDENTIAL_WRITE_CONFLICT'});
      assert.equal(revoked,true,'Neither delayed project credentials nor the PAT copy can restore revocation');
    } finally {globalThis.fetch=originalFetch;}
    let expoCalls=0;
    globalThis.fetch=async(input,init)=>{
      const url=String(input instanceof Request?input.url:input);
      if(url.startsWith(process.env.SUPABASE_URL!))return originalFetch(input,init);
      assert.equal(url,'https://api.expo.dev/graphql');
      expoCalls++;
      assert.equal(calls.filter(call=>call.path.endsWith('/prepare_provider_key_write')).at(-1)?.body.p_provider,'apikey_expo_project_id');
      await deleteUserProviderKey(context,'expo_project_id');
      return new Response(JSON.stringify({data:{me:{accounts:[{id:'account',name:'fixture',apps:[{id:'fixture-project-id',name:'fixture'}]}]}}}),{status:200});
    };
    try {
      const result=await ensureExpoProjectLinked({userId:user});
      assert.equal(result.projectId,null);
      assert.equal(result.error,'ENSURE_FAILED');
      assert.equal(expoCalls,1);
      assert.equal(revoked,true,'Expo lookup completion cannot restore a revoked project link');
    } finally {globalThis.fetch=originalFetch;}
    mode='unavailable';
    const count=calls.filter(call=>call.path.endsWith('/save_provider_key_if_current')).length;
    await assert.rejects(saveUserProviderKey(user,'openai','SYNTHETIC_UNSAVED_KEY'),{message:'Credential could not be saved. Retry shortly.'});
    assert.equal(calls.filter(call=>call.path.endsWith('/save_provider_key_if_current')).length,count);
    // Wait for the successful save's optional mirror request before restoring env.
    await new Promise<void>(resolve=>setTimeout(resolve,50));
  } finally {
    for(const [name,value]of before){if(value===undefined)delete process.env[name];else process.env[name]=value;}
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});

test('Supabase callback captures derived-key admissions before OAuth exchange and carries them through project selection',()=>{
  const source=readFileSync(new URL('../../routes/supabaseOAuth.ts',import.meta.url),'utf8');
  const callback=source.slice(source.indexOf("router.post('/connect'"),source.indexOf("router.get('/projects'"));
  const admission = callback.indexOf('prepareSupabaseConnectionWrite(req.userId!)');
  assert.ok(admission >= 0 && admission < callback.indexOf('await exchangeSupabaseOAuthCode('));
  assert.match(callback,/projectName: p\.name,\s+writeAdmissions,/);
  assert.match(callback,/saveUserProviderKey\(req\.userId!, 'supabase_pat', accessToken, \{ writeAdmission: writeAdmissions\.pat \}\)/);
  assert.equal((callback.match(/saveUserProviderKey\(/g)||[]).length,1,'Only the non-auto-provision branch writes the PAT directly');
});
