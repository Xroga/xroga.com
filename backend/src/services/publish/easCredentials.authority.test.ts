import assert from'node:assert/strict';import{test}from'node:test';import{readFile}from'node:fs/promises';
import{syncGooglePlayCredentialsToExpo,syncAppleAscApiKeyToExpo}from'./easCredentials.js';import{createTenantContext}from'../../security/tenantContext.js';

test('Expo store targets preserve explicit project/package, reject ambiguity and never mutate credentials',async t=>{
 const owner='11111111-1111-4111-8111-111111111111',context=createTenantContext({userId:owner,via:'remote_getuser'}),env={NODE_ENV:'test',SUPABASE_URL:'https://eas-fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture'},old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 t.after(()=>{for(const[k,v]of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;});
 let mode='ok',platform='android',mutations=0;
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  const url=new URL(String(input));
  if(url.origin===env.SUPABASE_URL){const provider=url.searchParams.get('provider')?.slice(3)??'';return Response.json({user_id:owner,provider,credential_revision:null,access_token:provider==='apikey_expo'?'enc:'+Buffer.from('fixture:EXPO_PRIVATE_CANARY').toString('base64'):null,metadata:{}});}
  assert.equal(url.href,'https://api.expo.dev/graphql');assert.equal(init?.redirect,'manual');const body=JSON.parse(String(init?.body));if(/^\s*mutation/.test(body.query))mutations++;assert.match(body.query,/^\s*query/);
  if(mode==='outage')return Response.json({errors:[{message:'PRIVATE_CANARY'}]},{status:503});
  if(body.query.includes('XrogaExpoAccountsAdmission'))return Response.json({data:{me:{accounts:[{id:'account',name:'account'}]}}});
  assert.equal(body.variables.appId,'explicit-project');
  const entry=(id:string,identifier:string)=>({id,app:{id:mode==='bad-receipt'?'foreign-project':'explicit-project'},...(platform==='android'?{applicationIdentifier:identifier,googleServiceAccountKeyForSubmissions:{id:'existing-key',privateKeyIdentifier:'gcp-key-id',clientEmail:'service@project.iam.gserviceaccount.com'}}:{appleAppIdentifier:{id:'apple-id',bundleIdentifier:identifier},appStoreConnectApiKeyForSubmissions:{id:'existing-key',keyIdentifier:'key-original',issuerIdentifier:'22222222-2222-4222-8222-222222222222'}})});
  const list=mode==='ambiguous'?[entry('first','com.other'),entry('second','com.second')]:[entry('other-credential','com.other'),...(mode==='create'||mode==='already-other'?[]:[entry('exact-credential','com.exact')])];
  return Response.json({data:{app:{byId:{id:mode==='foreign'?'foreign-project':'explicit-project',name:'fixture',slug:'fixture',ownerAccount:{id:'account',name:'account'},androidAppCredentialsList:list,iosAppCredentialsList:list}}}});
 });
 for(platform of ['android','ios'])for(mode of ['ok','create','already-other','foreign','ambiguous','bad-receipt','outage'])await t.test(platform+'/'+mode,async()=>{
  mutations=0;const input={userId:owner,tenantContext:context,projectId:'explicit-project'},identifier=mode==='ambiguous'?undefined:'com.exact';
  const call=()=>platform==='android'?syncGooglePlayCredentialsToExpo({...input,applicationIdentifier:identifier}):syncAppleAscApiKeyToExpo({...input,bundleIdentifier:identifier});
  if(['foreign','ambiguous','bad-receipt','outage'].includes(mode))await assert.rejects(call(),error=>{assert.doesNotMatch((error as Error).message,/PRIVATE_CANARY/);return true;});
  else{const result=await call();assert.equal(result.ok,mode==='ok');assert.doesNotMatch(JSON.stringify(result),/PRIVATE_CANARY/);if(mode!=='ok')assert.equal(result.manualSetupRequired,true);}
  assert.equal(mutations,0,'Neither verification nor missing configuration may upload a raw private key');
 });
 const route=await readFile(new URL('../../routes/publish.ts',import.meta.url),'utf8'),block=route.slice(route.indexOf("router.post('/eas-publish'"),route.indexOf('/** Save Chrome Web Store'));
 assert.match(block,/if \(parsed.data.submit\)/);assert.equal((block.match(/projectId: parsed.data.projectId/g)??[]).length,3);assert.match(block,/if \(!sync.ok\)[^\n]*return;/);
});
