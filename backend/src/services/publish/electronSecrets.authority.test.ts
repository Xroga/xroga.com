import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { parseElectronSecretRepository, syncElectronSigningSecretsToGitHub } from './electronSecrets.js';
import {createTenantContext} from '../../security/tenantContext.js';

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
  assert.doesNotMatch(source,/console\.warn\([^;]*\.message/s);
});

// Positive sealed-box decryption and provider outcome checks now execute through
// the actual prepare/confirm routes in electronSigning.security.test.ts. A raw
// owner ID or an unowned repository no longer authorizes the old direct write.
test('Electron signing material requires an owned project before repository-key or secret dispatch',async t=>{
 const userId='11111111-1111-4111-8111-111111111111',context=createTenantContext({userId,via:'remote_getuser'});
 const names=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'],before=names.map(n=>process.env[n]);
 Object.assign(process.env,{SUPABASE_URL:'https://electron-fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture'});
 t.after(()=>names.forEach((n,i)=>{if(before[i]===undefined)delete process.env[n];else process.env[n]=before[i];}));
 let reads=0;
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0])=>{
  const url=new URL(String(input));reads++;assert.equal(url.origin,'https://electron-fixture.invalid');assert.equal(url.pathname,'/rest/v1/projects');assert.equal(url.searchParams.get('user_id'),'eq.'+userId);return Response.json(null);
 });
 await assert.rejects(syncElectronSigningSecretsToGitHub({userId,tenantContext:context,repoFullName:'Owner/repo.name'}),{code:'SIGNING_MATERIAL_ADMISSION_DENIED'});assert.equal(reads,1);
});
