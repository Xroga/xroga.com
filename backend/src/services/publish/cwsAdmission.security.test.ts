import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createTenantContext} from '../../security/tenantContext.js';
import {publishChromeExtensionToStore} from './chromeWebStore.js';

test('CWS cannot upload opaque request ZIPs or act on raw/fabricated owner claims', async t => {
  const owner=randomUUID(),context=createTenantContext({userId:owner,via:'remote_getuser'});
  const values={NODE_ENV:'test',SUPABASE_URL:'https://cws-admission-fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-only'},old=Object.fromEntries(Object.keys(values).map(name=>[name,process.env[name]]));Object.assign(process.env,values);
  t.after(()=>{for(const[name,value]of Object.entries(old))if(value===undefined)delete process.env[name];else process.env[name]=value;});
  let effects=0;
  const creds={clientId:'client-fixture',clientSecret:'opaque-client-fixture',refreshToken:'opaque-refresh-fixture',extensionId:'item-a',publisherId:'publisher-a'};
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    const url=new URL(String(input));
    if(url.origin===values.SUPABASE_URL)return Response.json({user_id:owner,provider:'apikey_cws_oauth',credential_revision:null,access_token:'enc:'+Buffer.from('fixture:'+JSON.stringify(creds)).toString('base64'),metadata:{}});
    effects++;
    if(url.hostname==='oauth2.googleapis.com')return Response.json({access_token:'opaque-access-fixture'});
    assert.equal(url.hostname,'chromewebstore.googleapis.com');
    return Response.json({name:'publishers/publisher-a/items/item-a',itemId:'item-a',uploadState:'SUCCEEDED',state:'PENDING_REVIEW'});
  });
  for(const[label,tenantContext]of [['raw',undefined],['fabricated',{...context}],['issued-but-opaque',context]] as const)await t.test(label,async()=>{
    effects=0;const opts={userId:owner,tenantContext,zip:Buffer.alloc(80)};
    await assert.rejects(publishChromeExtensionToStore(opts));
    assert.equal(effects,0,'Original actor, owned inspectable source and exact publication confirmation must precede external dispatch');
  });
});
