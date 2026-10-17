import assert from 'node:assert/strict';
import {test} from 'node:test';
import {syncGooglePlayCredentialsToExpo,syncAppleAscApiKeyToExpo} from './easCredentials.js';
import {readFile} from 'node:fs/promises';

test('EAS credentials preserve explicit project/package and reject ambiguous or substituted receipts',async t=>{
  const names=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'],before=names.map(n=>process.env[n]);
  process.env.SUPABASE_URL='https://eas-fixture.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture';
  t.after(()=>names.forEach((n,i)=>{if(before[i]===undefined)delete process.env[n];else process.env[n]=before[i];}));
  let mode='ok',platform='android';const mutations:Array<{query:string;variables:Record<string,unknown>}>=[];
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    const url=new URL(String(input));
    if(url.origin==='https://eas-fixture.invalid'){
      const provider=url.searchParams.get('provider')?.slice(3);
      const value=provider==='apikey_expo'?'EXPO_PRIVATE_CANARY':provider==='apikey_google_play'?JSON.stringify({private_key:'GOOGLE_PRIVATE_CANARY'}):provider==='apikey_apple_asc_api'?JSON.stringify({keyId:'key-original',issuerId:'issuer',keyP8:'BEGIN PRIVATE KEY PRIVATE_CANARY'}):'stored-default-project';
      return Response.json({access_token:`enc:${Buffer.from(`fixture:${value}`).toString('base64')}`,metadata:{}});
    }
    assert.equal(url.href,'https://api.expo.dev/graphql');
    const body=JSON.parse(String(init?.body));
    if(body.query.trim().startsWith('query')){
      assert.equal(body.variables.appId,'explicit-project');
      const entry=(id:string,identifier:string)=>platform==='android'?{id,applicationIdentifier:identifier}:{id,appleAppIdentifier:{id:'apple-id',bundleIdentifier:identifier},appStoreConnectApiKeyForSubmissions:mode==='already-other'?{id:'old-key',keyIdentifier:'key-original'}:null};
      const list=mode==='ambiguous'?[entry('first','com.other'),entry('second','com.second')]:[entry('other-credential','com.other'),...(mode==='create'||mode==='already-other'?[]:[entry('exact-credential','com.exact')])];
      return Response.json({data:{app:{byId:{id:mode==='foreign'?'foreign-project':'explicit-project',ownerAccount:{id:'account'},androidAppCredentialsList:list,iosAppCredentialsList:list}}}});
    }
    mutations.push(body);
    if(mode==='outage')return Response.json({errors:[{message:'PRIVATE_CANARY'}]});
    if(body.query.includes('createGoogleServiceAccountKey')){assert.match(body.query,/googleServiceAccountKeyInput: \{ jsonKey: \$jsonKey \}/);return Response.json({data:{googleServiceAccountKey:{createGoogleServiceAccountKey:{id:'new-key'}}}});}
    if(body.query.includes('createAppStoreConnectApiKey'))return Response.json({data:{appStoreConnectApiKey:{createAppStoreConnectApiKey:{id:'new-key',keyIdentifier:'key-original'}}}});
    if(body.query.includes('createAndroidAppCredentials')){assert.match(body.query,/applicationIdentifier: \$applicationIdentifier/);assert.match(body.query,/androidAppCredentialsInput: \{\}/);assert.equal(body.variables.applicationIdentifier,'com.exact');return Response.json({data:{androidAppCredentials:{createAndroidAppCredentials:{id:'new-credential'}}}});}
    if(body.query.includes('createAppleAppIdentifier')){assert.equal(body.variables.appleAppIdentifierInput.bundleIdentifier,'com.exact');return Response.json({data:{appleAppIdentifier:{createAppleAppIdentifier:{id:'new-apple'}}}});}
    if(body.query.includes('createIosAppCredentials'))return Response.json({data:{iosAppCredentials:{createIosAppCredentials:{id:'new-credential'}}}});
    const id=body.variables.id??body.variables.iosAppCredentialsId;
    assert.notEqual(id,'other-credential');
    const field=platform==='android'?'androidAppCredentials':'iosAppCredentials',method=platform==='android'?'setGoogleServiceAccountKeyForSubmissions':'setAppStoreConnectApiKeyForSubmissions';
    return Response.json({data:{[field]:{[method]:{id:mode==='bad-receipt'?'foreign':id}}}});
  });
  for(platform of ['android','ios'])for(mode of ['ok','create','already-other','foreign','ambiguous','bad-receipt','outage']){
    mutations.length=0;
    const common={userId:'11111111-1111-4111-8111-111111111111',projectId:'explicit-project'};
    const identifier=mode==='ambiguous'?undefined:'com.exact';
    const result=platform==='android'?await syncGooglePlayCredentialsToExpo({...common,applicationIdentifier:identifier}):await syncAppleAscApiKeyToExpo({...common,bundleIdentifier:identifier});
    assert.equal(result.ok,['ok','create','already-other'].includes(mode),`${platform}/${mode}`);
    if(['foreign','ambiguous'].includes(mode))assert.equal(mutations.length,0);
    assert.doesNotMatch(JSON.stringify(result),/PRIVATE_CANARY/);
  }
  const route=await readFile(new URL('../../routes/publish.ts',import.meta.url),'utf8');
  const block=route.slice(route.indexOf("router.post('/eas-publish'"),route.indexOf('/** Save Chrome Web Store'));
  assert.match(block,/if \(parsed.data.submit\)/);
  assert.equal((block.match(/projectId: parsed.data.projectId/g)??[]).length,3);
  assert.match(block,/if \(!sync.ok\)[^\n]*return;/);
});
