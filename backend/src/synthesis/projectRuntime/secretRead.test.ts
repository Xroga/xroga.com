import assert from 'node:assert/strict';
import {test} from 'node:test';
import {restoreOwnerBoundEncryptedSecret,SupabaseProjectRuntimeStore} from './store.js';
import {CredentialVault} from '../../services/integrations/credentialVault.js';
import {DevelopmentCryptoProvider} from '../../services/integrations/cryptoProvider.js';
import {createTenantContext} from '../../security/tenantContext.js';
import {randomBytes} from 'node:crypto';

test('runtime v3 persistence receipts accept canonical vault records and reject version and ownership substitution',async()=>{
  const previous=process.env.NODE_ENV;process.env.NODE_ENV='test';
  const provider=new DevelopmentCryptoProvider('test',new Map([['test',randomBytes(32)]]));
  try{
    const now=new Date().toISOString(),owner='11111111-1111-4111-8111-111111111111';
    const encrypted=await new CredentialVault(provider).seal(createTenantContext({userId:owner,via:'persisted_owner'}),
      {tenant:owner,owner,provider:'runtime',account:'project',credentialType:'runtime-secret',recordId:'API_TOKEN',revision:now,scope:'preview'},'synthetic');
    const row={user_id:owner,project_id:'project',name:'API_TOKEN',scope:'preview',key_version:3,encrypted_value:encrypted,created_at:now,updated_at:now};
    assert.equal(restoreOwnerBoundEncryptedSecret(row,owner,'project').keyVersion,3);
    for(const mutation of [{user_id:'foreign'},{project_id:'foreign'},{key_version:1},{key_version:'3'},
      {encrypted_value:'vault:v3:bad'},{encrypted_value:encrypted+':extra'}]){
      assert.throws(()=>restoreOwnerBoundEncryptedSecret({...row,...mutation},owner,'project'),{code:'RESOURCE_ACCESS_UNAVAILABLE'});
    }
  }finally{provider.destroy();if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;}
});

test('runtime encrypted read binds returned owner and validates existing envelope metadata before consumers',async()=>{
  const now=new Date().toISOString(),envelope=`v1:${Buffer.alloc(12).toString('base64')}:${Buffer.alloc(16).toString('base64')}:${Buffer.from('synthetic').toString('base64')}`;
  const row={user_id:'owner',project_id:'project',name:'API_TOKEN',scope:'preview',key_version:1,encrypted_value:envelope,created_at:now,updated_at:now};
  assert.equal(restoreOwnerBoundEncryptedSecret(row,'owner','project').encryptedValue,envelope);
  for(const mutation of [{user_id:'other'},{project_id:'other'},{name:'bad-name'},{scope:'invalid'},{key_version:'1'},{key_version:2},{created_at:null},{updated_at:'invalid'},{encrypted_value:'v1:bad:bad:bad'},{encrypted_value:envelope.replace('v1:','v2:')},{encrypted_value:envelope+':extra'},{encrypted_value:`v1:${Buffer.alloc(11).toString('base64')}:${Buffer.alloc(16).toString('base64')}:YQ==`},{encrypted_value:`v1:${Buffer.alloc(12).toString('base64')}:${Buffer.alloc(15).toString('base64')}:YQ==`},{encrypted_value:`v1:${Buffer.alloc(12).toString('base64')}:${Buffer.alloc(16).toString('base64')}:`}])assert.throws(()=>restoreOwnerBoundEncryptedSecret({...row,...mutation},'owner','project'),{code:'RESOURCE_ACCESS_UNAVAILABLE'});
  const oldFetch=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL='http://127.0.0.1:49232';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic';
  try{
    globalThis.fetch=async input=>{const url=new URL(String(input));assert.equal(url.pathname,'/rest/v1/project_runtime_secrets');assert.equal(url.searchParams.get('user_id'),'eq.owner');assert.equal(url.searchParams.get('project_id'),'eq.project');assert.ok(url.searchParams.get('select')?.includes('user_id'));return Response.json([row,{...row,user_id:'other'}]);};
    await assert.rejects(new SupabaseProjectRuntimeStore().loadEncryptedSecrets('owner','project'),{code:'RESOURCE_ACCESS_UNAVAILABLE'});
  }finally{globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;}
});
