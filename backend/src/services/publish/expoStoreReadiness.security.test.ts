import test from'node:test';import assert from'node:assert/strict';import{randomUUID,generateKeyPairSync}from'node:crypto';
import{createTenantContext,type TenantContext}from'../../security/tenantContext.js';
import{syncGooglePlayCredentialsToExpo,syncAppleAscApiKeyToExpo}from'./easCredentials.js';
import{isTerminalModelFailure}from'../../ai/providerRuntime.js';

test('actual Expo store verification preserves configured operation and denies raw secret export',async t=>{
 const owner=randomUUID(),project=randomUUID(),account=randomUUID(),child=randomUUID(),keyId=randomUUID(),appleId=randomUUID(),revision=randomUUID(),context=createTenantContext({userId:owner,via:'remote_getuser'});
 const env={NODE_ENV:'test',SUPABASE_URL:'https://expo-store-fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture'},old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 t.after(()=>{for(const[k,v]of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;});
 const google:Record<string,unknown>={type:'service_account',project_id:'synthetic-project',private_key_id:'synthetic-key-id',private_key:generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'}).toString(),client_email:'synthetic@synthetic-project.iam.gserviceaccount.com',client_id:'123456789',auth_uri:'https://accounts.google.com/o/oauth2/auth',token_uri:'https://oauth2.googleapis.com/token'};
 const apple={keyId:'ABCDE12345',issuerId:randomUUID(),keyP8:generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey.export({type:'pkcs8',format:'pem'}).toString()};
 let platform='android',mode='configured',note='initial',currentRevision=revision,revoked=false,reads=0,external=0,audits=0;let controller=new AbortController();
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  const url=new URL(String(input));
  if(url.origin===env.SUPABASE_URL){
   reads++;
   if(url.pathname.endsWith('/production_audit_log')){
    const row=JSON.parse(String(init?.body));audits++;assert.equal(row.user_id,owner);assert.equal(row.actor_id,owner);assert.equal(row.outcome,'DENY');assert.equal(row.reason,'SECRET_EGRESS_DENIED');assert.equal(row.metadata.classification,'CREDENTIAL_SECRET');assert.doesNotMatch(String(init?.body),/BEGIN PRIVATE KEY|EXPO_PRIVATE_CANARY|synthetic-key-id/);
    if(mode==='audit-fail')return Response.json({message:'EXPO_PRIVATE_CANARY'},{status:503});if(mode==='revoke-at-audit')revoked=true;return Response.json(row);
   }
   const provider=url.searchParams.get('provider')?.slice(3)??'',store=platform==='android'?'apikey_google_play':'apikey_apple_asc_api';
   let value:string|null=provider==='apikey_expo'?'EXPO_PRIVATE_CANARY':provider==='apikey_expo_project_id'?project:provider==='apikey_google_play'?JSON.stringify(google):JSON.stringify(apple);
   if(mode==='no-saved-configured'&&provider===store)value=null;
   return Response.json({user_id:owner,provider,access_token:value===null?null:'enc:'+Buffer.from('fixture:'+value).toString('base64'),credential_revision:currentRevision,metadata:{revoked,note}});
  }
  external++;assert.equal(url.href,'https://api.expo.dev/graphql');assert.equal(init?.method,'POST');assert.equal(init?.redirect,'manual');assert.ok(init?.signal);assert.equal(new Headers(init?.headers).get('authorization'),'Bearer EXPO_PRIVATE_CANARY');
  const body=JSON.parse(String(init?.body));assert.match(body.query,/^\s*query\b/);assert.doesNotMatch(String(init?.body),/BEGIN PRIVATE KEY|EXPO_PRIVATE_CANARY|"private_key"|"keyP8"/);
  if(mode==='provider401'||mode==='provider403')return Response.json({message:'EXPO_PRIVATE_CANARY'},{status:mode==='provider401'?401:403});
  if(mode==='redirect')return new Response(null,{status:307,headers:{location:'http://169.254.169.254/latest/meta-data/'}});
  if(mode==='oversize')return new Response('x'.repeat(2*1024*1024+1));
  if(mode==='graphql-denial')return Response.json({errors:[{message:'EXPO_PRIVATE_CANARY',extensions:{code:'FORBIDDEN'}}]});
  if(mode==='outage')return Response.json({message:'EXPO_PRIVATE_CANARY'},{status:503});
  if(body.query.includes('XrogaExpoAccountsAdmission'))return Response.json({data:{me:{accounts:[{id:account,name:'synthetic'}]}}});
  assert.equal(body.variables.appId,project);assert.match(body.query,platform==='android'?/androidAppCredentialsList:\s*androidAppCredentials/:/iosAppCredentialsList:\s*iosAppCredentials/);
  const configured=!['missing','audit-fail','revoke-at-audit'].includes(mode),targetProject=mode==='foreign-child'?randomUUID():project;
  const entry=(id:string,identifier:string)=>platform==='android'?{id,app:{id:targetProject},applicationIdentifier:identifier,googleServiceAccountKeyForSubmissions:configured?{id:keyId,privateKeyIdentifier:mode==='mismatch'?'other-key':google.private_key_id,clientEmail:google.client_email}:null}:{id,app:{id:targetProject},appleAppIdentifier:{id:appleId,bundleIdentifier:identifier},appStoreConnectApiKeyForSubmissions:configured?{id:keyId,keyIdentifier:mode==='mismatch'?'other-key':apple.keyId,issuerIdentifier:apple.issuerId}:null};
  const rows=mode==='ambiguous'?[entry(child,'com.one'),entry(randomUUID(),'com.two')]:[entry(randomUUID(),'com.other'),entry(child,'com.synthetic.fixture')];
  if(mode==='credential-revision')currentRevision=randomUUID();if(mode==='credential-metadata')note='reconnected';if(mode==='cancel-at-metadata')controller.abort();
  return Response.json({data:{app:{byId:{id:mode==='foreign-project'?randomUUID():project,name:'fixture',slug:'fixture',ownerAccount:{id:mode==='foreign-account'?randomUUID():account,name:'synthetic'},androidAppCredentialsList:rows,iosAppCredentialsList:rows}}}});
 });
 const call=(tenantContext:TenantContext|undefined,identifier:string|undefined)=>platform==='android'?syncGooglePlayCredentialsToExpo({userId:owner,tenantContext,signal:controller.signal,projectId:project,applicationIdentifier:identifier}):syncAppleAscApiKeyToExpo({userId:owner,tenantContext,signal:controller.signal,projectId:project,bundleIdentifier:identifier});
 for(platform of ['android','ios']){
  for(const actor of [undefined,{...context}])await t.test(platform+' unissued actor',async()=>{const before=[reads,external];await assert.rejects(call(actor,'com.synthetic.fixture'));assert.deepEqual([reads,external],before);});
  for(const scenario of ['configured','no-saved-configured','missing','mismatch','foreign-project','foreign-account','foreign-child','ambiguous','credential-revision','credential-metadata','provider401','provider403','redirect','oversize','graphql-denial','outage','audit-fail','revoke-at-audit','cancel-at-metadata','fresh-authorized-recovery'])await t.test(platform+' '+scenario,async()=>{
   mode=scenario==='fresh-authorized-recovery'?'configured':scenario;revoked=false;note='initial';currentRevision=revision;controller=new AbortController();audits=0;const before=external;
   if(['configured','no-saved-configured','fresh-authorized-recovery'].includes(scenario)){const result=await call(context,'com.synthetic.fixture');assert.equal(result.ok,true);assert.equal(result.keyId,keyId);assert.match(result.message,/No private key was transferred/);assert.equal(audits,0);}
   else if(['missing','mismatch'].includes(scenario)){const result=await call(context,'com.synthetic.fixture');assert.equal(result.ok,false);assert.equal(result.manualSetupRequired,true);assert.equal(result.setupUrl,'https://expo.dev');assert.equal(audits,1);}
   else await assert.rejects(call(context,scenario==='ambiguous'?undefined:'com.synthetic.fixture'),error=>{assert.doesNotMatch((error as Error).message,/EXPO_PRIVATE_CANARY|BEGIN PRIVATE KEY/);if(['provider401','provider403','redirect','graphql-denial','credential-revision','credential-metadata','foreign-project','foreign-account','foreign-child','ambiguous','revoke-at-audit'].includes(scenario))assert.equal(isTerminalModelFailure(error),true);return true;});
   if(['credential-revision','credential-metadata','provider401','provider403','redirect','oversize','graphql-denial','outage','cancel-at-metadata'].includes(scenario))assert.equal(external-before,1,'Denial cannot trigger an additional metadata/provider route');
  });
 }
 platform='android';
 for(const scenario of ['unknown-extra','private-token-uri','malformed-key'])await t.test(scenario,async()=>{
  mode='configured';revoked=false;note='initial';currentRevision=revision;controller=new AbortController();const before=external,tokenUri=google.token_uri,originalKey=google.private_key;
  try{if(scenario==='unknown-extra')google.unapprovedPayload='private input outside credential schema';if(scenario==='private-token-uri')google.token_uri='http://169.254.169.254/latest/meta-data/';if(scenario==='malformed-key')google.private_key='untrusted non-key payload';const result=await call(context,'com.synthetic.fixture');assert.equal(result.ok,false);assert.equal(result.manualSetupRequired,true);assert.equal(external,before);}
  finally{delete google.unapprovedPayload;google.token_uri=tokenUri;google.private_key=originalKey;}
 });
});
