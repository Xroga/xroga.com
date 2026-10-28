import test from 'node:test';
import assert from 'node:assert/strict';
import {syncElectronSigningSecretsToGitHub} from './electronSecrets.js';
import {createTenantContext,type TenantContext} from '../../security/tenantContext.js';

test('Electron signing transfer denies raw and fabricated actors before credential or provider access',async t=>{
 const userId='11111111-1111-4111-8111-111111111111',context=createTenantContext({userId,via:'remote_getuser'});let requests=0;
 const oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 Object.assign(process.env,{SUPABASE_URL:'https://signing-fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-fixture'});
 t.after(()=>{if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;});
 t.mock.method(globalThis,'fetch',async()=>{requests++;throw new Error('No request admitted');});
 for(const tenantContext of [undefined,{...context} as TenantContext]){
  const opts={userId,repoFullName:'Owner/repo',tenantContext};
  await assert.rejects(syncElectronSigningSecretsToGitHub(opts));assert.equal(requests,0);
 }
});
