import test from 'node:test';
import assert from 'node:assert/strict';
import {shipChromeExtensionZip,shipElectronPortableZip,triggerElectronDesktopRelease,waitForDesktopReleaseZip} from './nonWebShip.js';
import {isTerminalModelFailure} from '../../ai/providerRuntime.js';
import {createTenantContext,type TenantContext} from '../../security/tenantContext.js';
import {nativeReleaseFixture} from './__tests__/nativeReleaseFixture.js';
import {confirmBusinessAction} from '../integrations/businessActionConfirmations.js';
import {resetCredentialVaultRuntimeForTests} from '../integrations/credentialVaultRuntime.js';

test('native GitHub release transport never sends source or credentials to a substituted asset target',async t=>{
 const userId='11111111-1111-4111-8111-111111111111',token='synthetic-release-provider-token';
 const env={NODE_ENV:'test',SUPABASE_URL:'https://release-fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture',XROGA_TEST_CREDENTIAL_KEK:Buffer.alloc(32,12).toString('base64url')};
 const prior=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 resetCredentialVaultRuntimeForTests();
 t.after(()=>{resetCredentialVaultRuntimeForTests();for(const[k,v]of Object.entries(prior)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
 const fixture=nativeReleaseFixture(userId);
 const context=createTenantContext({userId,via:'remote_getuser'});
 let mode='ok',assetName='extension.zip',tag='v1.0.0-extension',uploads=0,mutations=0,assetReads=0,reads=0,currentToken=token,revision='revision-one',revoked=false,controller:AbortController|undefined;
 const files=[{path:'manifest.json',content:'{"manifest_version":3,"name":"Synthetic fixture","version":"1.0.0"}'},{path:'package.json',content:'{"name":"synthetic-fixture","version":"1.0.0"}'},{path:'main.js',content:'console.log("synthetic fixture")'}];
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  const url=new URL(String(input));
  if(url.origin===env.SUPABASE_URL){reads++;return await fixture.database(url,init)??Response.json({user_id:userId,provider:'github',access_token:currentToken,metadata:{revoked},credential_revision:revision});}
  const method=init?.method??'GET';if(method!=='GET')mutations++;
  if(url.hostname!=='api.github.com'||url.pathname.endsWith('/assets')&&method==='POST'){
   uploads++;const size=(init?.body as Buffer).length;
   if(mode==='ok'){assert.equal(url.hostname,'uploads.github.com');assert.equal(url.pathname,'/repos/Owner/repo/releases/101/assets');assert.equal(init?.redirect,'manual');assert.ok(init?.signal);}
   return Response.json({id:202,name:assetName,state:'uploaded',size,browser_download_url:mode==='wrongAssetReceipt'?'https://foreign.invalid/source.zip':`https://github.com/Owner/repo/releases/download/${tag}/${assetName}`});
  }
  if(mode==='denied401'||mode==='denied403')return Response.json({message:token},{status:mode==='denied401'?401:403});
  if(mode==='redirect')return new Response(null,{status:307,headers:{location:'https://foreign.invalid/collect'}});
  if(url.pathname.endsWith('/assets')){assetReads++;return Response.json(mode==='deleteDenied'?[{id:88,name:assetName}]:[]);}
  if(method==='DELETE')return Response.json({message:token},{status:403});
  if(mode==='outage')return Response.json({message:token},{status:503});
  if(mode==='rotateAtRelease')currentToken='synthetic-reconnected-provider-token';
  if(mode==='reviseAtRelease')revision='revision-two';
  if(mode==='revokeAtRelease')revoked=true;
  if(mode==='cancelAtRelease')controller?.abort();
  return Response.json({id:101,tag_name:mode==='wrongTag'?'different-release':tag,html_url:`https://github.com/Owner/repo/releases/tag/${tag}`,upload_url:mode==='foreignOrigin'?'https://foreign.invalid/collect{?name,label}':mode==='foreignRelease'?'https://uploads.github.com/repos/Other/repo/releases/999/assets{?name,label}':`https://uploads.github.com/repos/Owner/repo/releases/101/assets{?name,label}`});
 });
 await t.test('all four native entry points reject raw or fabricated actor contexts before credential access',async()=>{
  for(const tenantContext of [undefined,{...context} as TenantContext]){
   const common={userId,repoFullName:'Owner/repo',tenantContext,files};const before=reads;
   for(const run of [()=>shipChromeExtensionZip(common),()=>shipElectronPortableZip(common),()=>triggerElectronDesktopRelease(common),()=>waitForDesktopReleaseZip({...common,timeoutMs:1})])await assert.rejects(run());
   assert.equal(reads,before);
  }
 });
 await t.test('foreign actors, malformed repositories and credential-bearing source fail before provider access',async()=>{
  const foreign=createTenantContext({userId:'22222222-2222-4222-8222-222222222222',via:'remote_getuser'});
  const before=reads;
  for(const ship of [shipChromeExtensionZip,shipElectronPortableZip]){
   await assert.rejects(ship({userId,repoFullName:'Owner/repo',files,tenantContext:foreign}));
   for(const repoFullName of ['Owner/repo/extra','Owner/../repo','Owner/repo?query=secret'])assert.equal((await ship({userId,repoFullName,files,tenantContext:context})).ok,false);
   await assert.rejects(ship({userId,repoFullName:'Owner/repo',tenantContext:context,files:[{path:'config.json',content:'SYNTHETIC_CREDENTIAL_DO_NOT_UPLOAD'}]}),error=>{assert.equal(isTerminalModelFailure(error),true);return true;});
  }
  assert.equal(reads,before);
 });
 for(const kind of ['chrome','electron']){
  const run=async()=>{const opts={userId,repoFullName:'Owner/repo',files,tenantContext:context,signal:controller?.signal};const prepared=kind==='chrome'?await shipChromeExtensionZip(opts):await shipElectronPortableZip(opts);if(!prepared.needsConfirmation)return prepared;assert.ok(prepared.confirmation);const executed=await confirmBusinessAction(context,prepared.confirmation.id);return JSON.parse(executed.execution.resultText) as typeof prepared;};
  assetName=kind==='chrome'?'extension.zip':'desktop.zip';tag=kind==='chrome'?'v1.0.0-extension':'v1.0.0-portable';
  await t.test(kind+' refuses substituted upload origins and release paths before source egress',async()=>{
   for(mode of ['foreignOrigin','foreignRelease','wrongTag']){uploads=0;assetReads=0;await assert.rejects(run());assert.equal(uploads,0);assert.equal(assetReads,0);}
  });
  await t.test(kind+' provider denial cannot create release, delete asset or fall through to upload',async()=>{
   for(mode of ['denied401','denied403','redirect']){uploads=0;mutations=0;await assert.rejects(run(),error=>{assert.equal(isTerminalModelFailure(error),true);return true;});assert.equal(mutations,0);assert.equal(uploads,0);}
   mode='deleteDenied';uploads=0;await assert.rejects(run(),error=>{assert.equal(isTerminalModelFailure(error),true);return true;});assert.equal(uploads,0);
  });
  await t.test(kind+' cannot publish a foreign download receipt',async()=>{mode='wrongAssetReceipt';uploads=0;await assert.rejects(run());assert.equal(uploads,1);});
  await t.test(kind+' opaque held credential cannot be embedded in the source archive',async()=>{
   mode='ok';uploads=0;mutations=0;
   const opts={userId,repoFullName:'Owner/repo',tenantContext:context,files:[...files,{path:'opaque.json',content:JSON.stringify({configuration:token})}]};
   await assert.rejects(kind==='chrome'?shipChromeExtensionZip(opts):shipElectronPortableZip(opts));assert.equal(uploads,0);assert.equal(mutations,0);
  });
  await t.test(kind+' cancellation and credential rotation after metadata prevent later effects',async()=>{
   try{for(mode of ['rotateAtRelease','reviseAtRelease','revokeAtRelease','cancelAtRelease']){currentToken=token;revision='revision-one';revoked=false;controller=new AbortController();uploads=0;mutations=0;await assert.rejects(run());assert.equal(uploads,0);assert.equal(mutations,0);}}
   finally{currentToken=token;revision='revision-one';revoked=false;controller=undefined;}
  });
  await t.test(kind+' ordinary outage remains a truthful failure and a later request works',async()=>{mode='outage';uploads=0;mutations=0;const failed=await run();assert.equal(failed.ok,false);assert.equal(uploads,0);assert.equal(mutations,0);assert.doesNotMatch(JSON.stringify(failed),new RegExp(token));mode='ok';assert.equal((await run()).ok,true);});
 }
 await t.test('desktop release authorization denial cannot trigger workflow fallback',async()=>{mode='denied403';mutations=0;await assert.rejects(triggerElectronDesktopRelease({userId,repoFullName:'Owner/repo',tenantContext:context}),error=>{assert.equal(isTerminalModelFailure(error),true);return true;});assert.equal(mutations,0);});
});
