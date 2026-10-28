import test from 'node:test';import assert from 'node:assert/strict';import{randomUUID,generateKeyPairSync,createHash}from'node:crypto';
import{createTenantContext}from'../../security/tenantContext.js';
import{syncGooglePlayCredentialsToExpo,syncAppleAscApiKeyToExpo}from'./easCredentials.js';
import{triggerEasPublish}from'./easPublish.js';
import{nativeReleaseFixture}from'./__tests__/nativeReleaseFixture.js';

test('Expo credential delegation and workflow dispatch require original actor and durable exact approval',async t=>{
 const owner=randomUUID(),project=randomUUID(),account=randomUUID(),credential=randomUUID(),createdKey=randomUUID(),run=randomUUID(),revision=randomUUID(),context=createTenantContext({userId:owner,via:'remote_getuser'});
 const fixture=nativeReleaseFixture(owner),sha='a'.repeat(40),workflow='jobs:\n  build:\n    type: build\n';
 const env={NODE_ENV:'test',SUPABASE_URL:'https://expo-canonical-fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture'},old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 t.after(()=>{for(const[k,v]of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;});
 const privateKey=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'}).toString(),keyP8=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey.export({type:'pkcs8',format:'pem'}).toString();
 const google:Record<string,unknown>={type:'service_account',project_id:'synthetic-project',private_key_id:'synthetic-key',private_key:privateKey,client_email:'synthetic@synthetic-project.iam.gserviceaccount.com',client_id:'123456789',auth_uri:'https://accounts.google.com/o/oauth2/auth',token_uri:'https://oauth2.googleapis.com/token',auth_provider_x509_cert_url:'https://www.googleapis.com/oauth2/v1/certs',client_x509_cert_url:'https://www.googleapis.com/robot/v1/metadata/x509/synthetic%40synthetic-project.iam.gserviceaccount.com'};
 const apple={keyId:'ABCDE12345',issuerId:randomUUID(),keyP8};let mutations=0,reads=0;
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  const url=new URL(String(input));
  if(url.origin===env.SUPABASE_URL){
   reads++;if(url.pathname.endsWith('/prepare_provider_key_write'))return Response.json(revision);
   if(url.pathname.endsWith('/production_audit_log')){const row=JSON.parse(String(init?.body));assert.equal(row.user_id,owner);assert.equal(row.outcome,'DENY');assert.equal(row.metadata.classification,'CREDENTIAL_SECRET');assert.doesNotMatch(String(init?.body),/BEGIN PRIVATE KEY|opaque-expo-fixture|private data outside/);return Response.json(row);}
   const handled=await fixture.database(url,init);if(handled)return handled;
   if(url.pathname.endsWith('/github_integrations')||url.searchParams.get('provider')==='eq.github')return Response.json({user_id:owner,provider:'github',access_token:'synthetic-github-fixture',credential_revision:revision,metadata:{}});
   const provider=url.searchParams.get('provider')?.slice(3)??'';const value=provider==='apikey_expo'?'opaque-expo-fixture':provider==='apikey_google_play'?JSON.stringify(google):provider==='apikey_apple_asc_api'?JSON.stringify(apple):project;
   return Response.json({user_id:owner,provider,credential_revision:revision,access_token:'enc:'+Buffer.from('fixture:'+value).toString('base64'),metadata:{}});
  }
  if(url.origin==='https://api.github.com'){
   const size=Buffer.byteLength(workflow),blob=createHash('sha1').update(`blob ${size}\0`).update(workflow).digest('hex'),tree='c'.repeat(40);
   if(url.pathname.includes('/git/commits/'))return Response.json({sha,tree:{sha:tree}});
   if(url.pathname.includes('/git/trees/'))return Response.json({sha:tree,truncated:false,tree:[{path:'.eas/workflows/build-android.yml',type:'blob',mode:'100644',sha:blob,size}]});
   if(url.pathname.includes('/git/blobs/'))return Response.json({sha:blob,encoding:'base64',size,content:Buffer.from(workflow).toString('base64')});
   return Response.json(url.pathname.includes('/commits/')?{sha}:{type:'file',path:'.eas/workflows/build-android.yml',name:'build-android.yml',encoding:'base64',size,content:Buffer.from(workflow).toString('base64')});
  }
  assert.equal(url.origin,'https://api.expo.dev');const body=JSON.parse(String(init?.body));
  if(url.pathname==='/v2/workflows/dispatch'){mutations++;return Response.json({data:{id:run,url:`https://expo.dev/accounts/synthetic/projects/fixture/workflows/${run}`}});}
  assert.equal(url.pathname,'/graphql');
  if(body.query.trim().startsWith('query'))return Response.json({data:{me:{accounts:[{id:account,name:'synthetic',apps:[{id:project,name:'fixture',slug:'fixture'}]}]},app:{byId:{id:project,name:'fixture',slug:'fixture',ownerAccount:{id:account,name:'synthetic'},githubRepository:{metadata:{githubRepoOwnerName:'Owner',githubRepoName:'repo'}},androidAppCredentialsList:[{id:credential,app:{id:project},applicationIdentifier:'com.synthetic.fixture'}],iosAppCredentialsList:[{id:credential,app:{id:project},appleAppIdentifier:{id:randomUUID(),bundleIdentifier:'com.synthetic.fixture'},appStoreConnectApiKeyForSubmissions:null}]}}}});
  mutations++;
  if(body.query.includes('createGoogleServiceAccountKey'))return Response.json({data:{googleServiceAccountKey:{createGoogleServiceAccountKey:{id:createdKey}}}});
  if(body.query.includes('createAppStoreConnectApiKey'))return Response.json({data:{appStoreConnectApiKey:{createAppStoreConnectApiKey:{id:createdKey,keyIdentifier:apple.keyId}}}});
  if(body.query.includes('setGoogleServiceAccountKeyForSubmissions'))return Response.json({data:{androidAppCredentials:{setGoogleServiceAccountKeyForSubmissions:{id:credential}}}});
  if(body.query.includes('setAppStoreConnectApiKeyForSubmissions'))return Response.json({data:{iosAppCredentials:{setAppStoreConnectApiKeyForSubmissions:{id:credential}}}});
  throw new Error('Unexpected Expo fixture operation');
 });
 for(const[label,tenantContext]of [['raw',undefined],['fabricated',{...context}],['issued',context]]as const){
  const opts={userId:owner,tenantContext,projectId:project};
  const operations=[['google',()=>syncGooglePlayCredentialsToExpo({...opts,applicationIdentifier:'com.synthetic.fixture'})],['apple',()=>syncAppleAscApiKeyToExpo({...opts,bundleIdentifier:'com.synthetic.fixture'})],['workflow',()=>triggerEasPublish({...opts,platform:'android',submit:false})]]as const;
  for(const[name,call]of operations)await t.test(label+' '+name,async()=>{
   mutations=0;const before=reads;
   if(label==='issued'){const result=await call();assert.equal(mutations,0,'Preparation must not transfer credentials or queue a build');assert.equal(result.ok,false);if(name==='workflow')assert.equal((result as{needsConfirmation?:boolean}).needsConfirmation,true);else assert.equal((result as{manualSetupRequired?:boolean}).manualSetupRequired,true,'Frozen policy denies raw private-key export even with approval');}
   else{await assert.rejects(call());assert.equal(mutations,0);assert.equal(reads,before,'Unissued actor cannot read credentials');}
  });
 }
 for(const scenario of ['extra-private-data','private-token-uri'])await t.test(scenario,async()=>{
  const tokenUri=google.token_uri;mutations=0;
  try{
   if(scenario==='extra-private-data')google.unapprovedPayload='private data outside the service account schema';else google.token_uri='http://169.254.169.254/latest/meta-data/';
   const result=await syncGooglePlayCredentialsToExpo({userId:owner,tenantContext:context,projectId:project,applicationIdentifier:'com.synthetic.fixture'});
   assert.equal(mutations,0,'Credential delegation cannot carry arbitrary private fields or an arbitrary token endpoint');assert.equal(result.ok,false);
  }finally{delete google.unapprovedPayload;google.token_uri=tokenUri;}
 });
});
