import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { parseElectronSecretRepository, syncElectronSigningSecretsToGitHub } from './electronSecrets.js';

test('Electron signing secret destinations are exact repositories before any credential access',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('Credential access forbidden');});
  for(const value of ['owner/repo/extra','owner/repo?query=1','owner/repo#fragment','owner/..','../repo','owner/%2e%2e','owner/repo%2fother','owner\\repo','https://evil.invalid/owner/repo','https://github.com/owner/repo/tree/main','https://user@github.com/owner/repo',' owner/repo','owner/repo ','owner/repo//','owner//repo','owner/','/repo']){
    assert.equal(parseElectronSecretRepository(value),null,value);
    assert.deepEqual(await syncElectronSigningSecretsToGitHub({userId:'owner',repoFullName:value}),{ok:false,synced:[],message:'Invalid repo'});
  }
  assert.equal(calls,0);
  for(const value of ['Owner/repo.name','https://github.com/Owner/repo.name','https://github.com/Owner/repo.name.git/']){
    assert.deepEqual(parseElectronSecretRepository(value),{owner:'Owner',repo:'repo.name'});
  }
  const source=await readFile(new URL('./electronSecrets.ts',import.meta.url),'utf8');
  assert.match(source,/encodeURIComponent\(opts.owner\).*encodeURIComponent\(opts.repo\)/);
  assert.doesNotMatch(source,/console\.warn\([^;]*\.message/s);
  assert.match(source,/put.status === 201 \|\| put.status === 204;/);
});

test('Electron secret writes seal to the exact repository and redact transport failures',async t=>{
  const imported=await import('libsodium-wrappers'),sodium=imported.default??imported;await sodium.ready;
  const pair=sodium.crypto_box_keypair(),calls:string[]=[],logs:unknown[][]=[];
  const names=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];const before=names.map(name=>process.env[name]);
  process.env.SUPABASE_URL='https://electron-fixture.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture';
  t.after(()=>names.forEach((name,i)=>{if(before[i]===undefined)delete process.env[name];else process.env[name]=before[i];}));
  let fail=false;
  t.mock.method(console,'warn',(...args:unknown[])=>logs.push(args));
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    const url=new URL(String(input));calls.push(url.href);
    if(url.origin==='https://electron-fixture.invalid'){
      if(url.pathname.endsWith('/github_integrations') || url.searchParams.get('provider') === 'eq.github')return Response.json({access_token:'GITHUB_PRIVATE_CANARY'});
      const provider=url.searchParams.get('provider');
      return Response.json({user_id:'11111111-1111-4111-8111-111111111111',provider:provider?.slice(3),credential_revision:null,access_token:provider==='eq.apikey_electron_csc_link'?`enc:${Buffer.from('fixture:CSC_PRIVATE_CANARY').toString('base64')}`:'',metadata:{}});
    }
    assert.equal(url.origin,'https://api.github.com');
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer GITHUB_PRIVATE_CANARY');
    if(fail)throw new Error('GITHUB_PRIVATE_CANARY CSC_PRIVATE_CANARY');
    if(url.pathname.endsWith('/public-key')){
      assert.equal(url.pathname,'/repos/Owner/repo.name/actions/secrets/public-key');
      return Response.json({key:sodium.to_base64(pair.publicKey,sodium.base64_variants.ORIGINAL),key_id:'fixture-key'});
    }
    assert.equal(url.pathname,'/repos/Owner/repo.name/actions/secrets/CSC_LINK');
    assert.equal(init?.method,'PUT');const body=JSON.parse(String(init.body));
    assert.equal(body.key_id,'fixture-key');assert.doesNotMatch(String(init.body),/CSC_PRIVATE_CANARY/);
    assert.equal(sodium.to_string(sodium.crypto_box_seal_open(sodium.from_base64(body.encrypted_value,sodium.base64_variants.ORIGINAL),pair.publicKey,pair.privateKey)),'CSC_PRIVATE_CANARY');
    return new Response(null,{status:204});
  });
  const opts={userId:'11111111-1111-4111-8111-111111111111',repoFullName:'https://github.com/Owner/repo.name.git'};
  assert.deepEqual((await syncElectronSigningSecretsToGitHub(opts)).synced,['CSC_LINK']);
  fail=true;const result=await syncElectronSigningSecretsToGitHub(opts);assert.equal(result.ok,false);
  assert.doesNotMatch(JSON.stringify({logs,result}),/PRIVATE_CANARY/);assert.ok(calls.length>0);
});
