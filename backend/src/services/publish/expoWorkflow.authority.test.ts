import test from'node:test';import assert from'node:assert/strict';import{randomUUID,createHash}from'node:crypto';
import{createTenantContext}from'../../security/tenantContext.js';
import{triggerEasPublish,executeExpoNativeAction,ensureExpoProjectLinked,createExpoApp,listExpoApps,linkOwnedExpoProject}from'./easPublish.js';
import{confirmBusinessAction,cancelBusinessActionConfirmation}from'../integrations/businessActionConfirmations.js';
import{actionPlanDigest}from'../integrations/businessAction.js';
import{resetCredentialVaultRuntimeForTests}from'../integrations/credentialVaultRuntime.js';
import{nativeReleaseFixture}from'./__tests__/nativeReleaseFixture.js';

test('actual Expo native confirmation pins owner, project, immutable workflow, current sources and one dispatch',async t=>{
 const env={NODE_ENV:'test',SUPABASE_URL:'https://expo-workflow-owned.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture',XROGA_TEST_CREDENTIAL_KEK:Buffer.alloc(32,17).toString('base64url')},old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);resetCredentialVaultRuntimeForTests();
 t.after(()=>{resetCredentialVaultRuntimeForTests();for(const[k,v]of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;});
 const owner=randomUUID(),project=randomUUID(),account=randomUUID(),child=randomUUID(),key=randomUUID(),issuer=randomUUID(),run=randomUUID(),context=createTenantContext({userId:owner,via:'remote_getuser'}),fixture=nativeReleaseFixture(owner),sha='a'.repeat(40),head='b'.repeat(40),workflow='on:\n  workflow_dispatch:\njobs:\n  build:\n    type: build\n    params:\n      platform: android\n';
 let mode='ok',platform:'android'|'ios'='android',submit=false,dispatches=0,creates=0,external=0,note='initial',githubNote='initial',configuredKey=key,createMode=false,accountRevoked=false,binaryMode=false;
 const input=()=>({userId:owner,tenantContext:context,projectId:project,platform,submit,gitRef:'main'});
 t.mock.method(globalThis,'fetch',async(resource:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  const url=new URL(String(resource));
  if(url.origin===env.SUPABASE_URL){
   const handled=await fixture.database(url,init);if(handled){if(url.pathname.endsWith('/production_audit_log')){if(mode==='owner-at-audit')fixture.projectOwner=randomUUID();if(mode==='account-at-audit')accountRevoked=true;if(mode==='store-at-audit')configuredKey=randomUUID();}return handled;}
   const provider=url.searchParams.get('provider')?.slice(3)??'';
   if(url.pathname.endsWith('/github_integrations')||provider==='github')return Response.json({user_id:owner,provider:'github',access_token:'fixture-github-token',credential_revision:null,metadata:{note:githubNote}});
   const value=provider==='apikey_expo'?'fixture-expo-token':provider==='apikey_expo_project_id'?(createMode?null:project):null;
   return Response.json({user_id:owner,provider,access_token:value===null?null:'enc:'+Buffer.from('fixture:'+value).toString('base64'),credential_revision:null,metadata:{note}});
  }
  external++;assert.equal(init?.redirect,'manual');assert.ok(init?.signal);
  if(url.origin==='https://api.github.com'){
   if(mode==='source-network')throw new Error('fixture-github-token PRIVATE_PROVIDER_CANARY');
   if(mode==='source-malformed')return new Response('fixture-github-token PRIVATE_PROVIDER_CANARY');
   if(mode==='cancel-at-source'&&fixture.row)fixture.row.status='cancelled';
   if(mode==='source403')return Response.json({message:'PRIVATE_PROVIDER_CANARY'},{status:403});
   if(mode==='missing-workflow'&&url.pathname.includes('/contents/'))return Response.json({message:'not found'},{status:404});
   const name=`${submit?'publish':'build'}-${platform}.yml`,text=mode==='workflow-changed'?workflow+'# changed\n':mode==='secret-in-workflow'?workflow+'# fixture-expo-token\n':workflow;
   const size=Buffer.byteLength(text),blob=createHash('sha1').update(`blob ${size}\0`).update(text).digest('hex'),tree='c'.repeat(40);
   const secret=mode==='source-lfs'?'version https://git-lfs.github.com/spec/v1\noid sha256:'+sha+sha.slice(0,24)+'\nsize 999\n':'{"private":"fixture-expo-token"}',secretSize=Buffer.byteLength(secret),secretBlob=createHash('sha1').update(`blob ${secretSize}\0`).update(secret).digest('hex');
   const asset=Buffer.from([137,80,78,71,13,10,26,10,0]),assetBlob=createHash('sha1').update(`blob ${asset.length}\0`).update(asset).digest('hex');
   if(url.pathname.includes('/git/commits/'))return Response.json({sha,tree:{sha:tree}});
   if(url.pathname.includes('/git/trees/'))return Response.json({sha:tree,truncated:mode==='truncated-source',tree:[{path:'.eas/workflows/'+name,type:'blob',mode:mode==='source-symlink'?'120000':'100644',sha:blob,size},...(mode==='source-key-file'?[{path:'.env.production',type:'blob',mode:'100644',sha:blob,size}]:[]),...(['source-held-secret','source-lfs'].includes(mode)?[{path:'src/opaque.json',type:'blob',mode:'100644',sha:secretBlob,size:secretSize}]:[]),...(binaryMode?[{path:'assets/logo.png',type:'blob',mode:'100644',sha:assetBlob,size:asset.length}]:[])]});
   if(url.pathname.endsWith('/git/blobs/'+secretBlob))return Response.json({sha:secretBlob,encoding:'base64',size:secretSize,content:Buffer.from(secret).toString('base64')});
   if(url.pathname.endsWith('/git/blobs/'+assetBlob))return Response.json({sha:assetBlob,encoding:'base64',size:asset.length,content:asset.toString('base64')});
   if(url.pathname.includes('/git/blobs/'))return Response.json({sha:mode==='blob-identity'?head:blob,encoding:'base64',size,content:Buffer.from(mode==='secret-in-blob'?text+'fixture-expo-token':text).toString('base64')});
   if(url.pathname.includes('/commits/'))return Response.json({sha:url.pathname.endsWith('/main')&&mode==='head-advanced'?head:sha});
   return Response.json({type:'file',name,path:'.eas/workflows/'+name,encoding:'base64',size:Buffer.byteLength(text),content:Buffer.from(text).toString('base64')});
  }
  assert.equal(url.origin,'https://api.expo.dev');assert.equal(new Headers(init?.headers).get('authorization'),'Bearer fixture-expo-token');
  if(url.pathname==='/v2/workflows/dispatch'){
   dispatches++;assert.ok(fixture.row?.effect_started_at);assert.ok(fixture.audits);assert.deepEqual(JSON.parse(String(init?.body)),{appId:project,gitRef:sha,fileName:`${submit?'publish':'build'}-${platform}.yml`});
   if(mode==='dispatch-network')throw new Error('fixture-expo-token PRIVATE_PROVIDER_CANARY');
   if(mode==='dispatch403'||mode==='dispatch401')return Response.json({message:'not found PRIVATE_PROVIDER_CANARY'},{status:mode==='dispatch403'?403:401});
   if(mode==='dispatch503')return Response.json({message:'PRIVATE_PROVIDER_CANARY'},{status:503});
   if(mode==='dispatch-redirect')return new Response(null,{status:307,headers:{location:'http://169.254.169.254/'}});
   if(mode==='cancel-at-dispatch'&&fixture.row)fixture.row.status='cancelled';
   return Response.json({data:{id:run,url:mode==='foreign-run-url'?'https://foreign.invalid/collect':`https://expo.dev/accounts/fixture/projects/app/workflows/${run}`}});
  }
  if(url.pathname===`/v2/workflows/runs/${run}`)return Response.json({data:{id:mode==='foreign-run'?randomUUID():run,url:`https://expo.dev/accounts/fixture/projects/app/workflows/${run}`,gitCommitHash:mode==='wrong-commit'?head:sha,requestedGitRef:mode==='wrong-ref'?'main':sha,status:mode==='bad-state'?'invented':'new'}});
  assert.equal(url.pathname,'/graphql');const body=JSON.parse(String(init?.body));
  if(/^\s*mutation/.test(body.query)){creates++;assert.ok(fixture.row?.effect_started_at);assert.deepEqual(body.variables,{appInput:{accountId:account,projectName:'fixture-app'}});return Response.json({data:{app:{createApp:{id:project}}}});}
  const store={id:child,app:{id:project},applicationIdentifier:'com.synthetic.fixture',googleServiceAccountKeyForSubmissions:{id:configuredKey,privateKeyIdentifier:'public-key',clientEmail:'fixture@fixture.iam.gserviceaccount.com'},appleAppIdentifier:{id:child,bundleIdentifier:'com.synthetic.fixture'},appStoreConnectApiKeyForSubmissions:{id:configuredKey,keyIdentifier:'PUBLICKEY1',issuerIdentifier:issuer}};
  return Response.json({data:{me:{accounts:[{id:account,name:'fixture',apps:createMode?[]:[{id:project,name:'app',slug:'app'}]}]},app:{byId:{id:project,name:'app',slug:createMode?'fixture-app':'app',ownerAccount:{id:mode==='foreign-account'||accountRevoked?randomUUID():account,name:'fixture'},githubRepository:{metadata:{githubRepoOwnerName:mode==='foreign-repository'?'Foreign':'Owner',githubRepoName:'repo'}},androidAppCredentialsList:[store],iosAppCredentialsList:[store]}}}});
 });
 for(const scenario of ['ok','binary-source','submit-android','submit-ios','restart','head-advanced','concurrent','cancelled','cancel-at-source','cancel-at-audit','owner-at-audit','account-at-audit','store-at-audit','audit-fail','cancel-at-claim','cancel-after-claim','expire-after-claim','expo-epoch','github-epoch','store-key-changed','foreign-account','foreign-repository','foreign-local-project','workflow-changed','source-network','source-malformed','truncated-source','source-symlink','source-key-file','source-held-secret','blob-identity','secret-in-blob','changed-target','changed-proof','changed-expiry','dispatch401','dispatch403','dispatch503','dispatch-network','dispatch-redirect','cancel-at-dispatch','foreign-run-url','foreign-run','wrong-commit','wrong-ref','bad-state','authorized-after-outage'])await t.test(scenario,async()=>{
  mode='ok';note='initial';githubNote='initial';configuredKey=key;accountRevoked=false;binaryMode=scenario==='binary-source';fixture.mode='ok';fixture.projectOwner=owner;fixture.audits=0;dispatches=0;creates=0;createMode=false;submit=['submit-android','submit-ios','store-key-changed','store-at-audit'].includes(scenario);platform=scenario==='submit-ios'?'ios':'android';
  const prepared=await triggerEasPublish(input());assert.equal(prepared.ok,false);assert.equal(prepared.needsConfirmation,true);assert.ok(prepared.reviewUrl);assert.ok(fixture.row);assert.equal(dispatches,0);assert.equal(creates,0);assert.doesNotMatch(JSON.stringify(prepared),/fixture-expo-token|fixture-github-token|nativeExpoProof/);
  await assert.rejects(executeExpoNativeAction(owner,fixture.row.plan));assert.equal(dispatches,0);
  mode=scenario;fixture.mode=scenario;
  if(scenario==='restart')resetCredentialVaultRuntimeForTests();
  if(scenario==='expo-epoch')note='changed';if(scenario==='github-epoch')githubNote='changed';if(scenario==='store-key-changed')configuredKey=randomUUID();
  if(scenario==='foreign-local-project')fixture.projectOwner=randomUUID();
  if(scenario==='cancelled')await cancelBusinessActionConfirmation(owner,fixture.row.id);
  if(scenario.startsWith('changed-')){if(scenario==='changed-target')fixture.row.plan.arguments.destination='https://foreign.invalid';if(scenario==='changed-proof')fixture.row.plan.scopeRequirements={nativeExpoProof:'vault:v3:unissued'};if(scenario==='changed-expiry')fixture.row.plan.authority!.expiresAt=new Date(Date.now()+14*60000).toISOString();const{planDigest:_,...unsigned}=fixture.row.plan;fixture.row.plan.planDigest=actionPlanDigest(unsigned);fixture.row.plan_digest=fixture.row.plan.planDigest;fixture.row.expires_at=fixture.row.plan.authority!.expiresAt;}
  const confirm=()=>confirmBusinessAction(context,fixture.row!.id);
  if(scenario==='concurrent'){const result=await Promise.allSettled([confirm(),confirm()]);assert.equal(result.filter(row=>row.status==='fulfilled').length,1);assert.equal(dispatches,1);return;}
  if(['ok','binary-source','submit-android','submit-ios','restart','head-advanced','authorized-after-outage'].includes(scenario)){const result=await confirm(),value=JSON.parse(result.execution.resultText);assert.equal(value.ok,true);assert.equal(value.workflowRunId,run);assert.equal(value.workflowStatus,'new');assert.match(value.message,/not verified/);assert.equal(fixture.row.status,'consumed');assert.equal(dispatches,1);}
  else{await assert.rejects(confirm(),error=>{assert.doesNotMatch((error as Error).message,/PRIVATE_PROVIDER_CANARY|fixture-expo-token|fixture-github-token/);return true;});assert.equal(dispatches,['dispatch401','dispatch403','dispatch503','dispatch-network','dispatch-redirect','cancel-at-dispatch','foreign-run-url','foreign-run','wrong-commit','wrong-ref','bad-state'].includes(scenario)?1:0);const before=dispatches;await assert.rejects(confirm());assert.equal(dispatches,before,'Uncertain or denied actions cannot be retried');}
 });
 for(mode of ['missing-workflow','secret-in-workflow','source403','source-lfs'])await t.test(mode+' fails preparation without dispatch fallback',async()=>{fixture.mode='ok';submit=true;platform='android';dispatches=0;note='initial';githubNote='initial';configuredKey=key;await assert.rejects(triggerEasPublish(input()));assert.equal(dispatches,0);});
 await t.test('app creation requires exact approval and returns a verified ID without changing the saved selection',async()=>{mode='ok';fixture.mode='ok';createMode=true;note='initial';creates=0;await assert.rejects(createExpoApp('fixture-expo-token',{accountId:account,projectName:'fixture-app'}));const prepared=await ensureExpoProjectLinked({userId:owner,tenantContext:context,projectName:'fixture-app'});assert.equal(prepared.needsConfirmation,true);assert.equal(prepared.created,false);assert.equal(creates,0);const result=await confirmBusinessAction(context,fixture.row!.id);assert.equal(JSON.parse(result.execution.resultText).projectId,project);assert.equal(creates,1);});
 await t.test('metadata helpers reject raw and fabricated actors before network',async()=>{createMode=false;const before=external;for(const actor of [undefined,{...context}]){await assert.rejects(listExpoApps('fixture-expo-token',{userId:owner,tenantContext:actor}));await assert.rejects(linkOwnedExpoProject({userId:owner,tenantContext:actor,projectId:project}));await assert.rejects(ensureExpoProjectLinked({userId:owner,tenantContext:actor}));}assert.equal(external,before);});
});
