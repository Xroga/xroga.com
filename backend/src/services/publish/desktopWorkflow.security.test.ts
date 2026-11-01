import test from 'node:test';import assert from 'node:assert/strict';import{randomUUID}from'node:crypto';
import{createTenantContext}from'../../security/tenantContext.js';
import{triggerElectronDesktopRelease}from'./nonWebShip.js';
import{waitForDesktopReleaseZip}from'./nonWebShip.js';
import{confirmBusinessAction}from'../integrations/businessActionConfirmations.js';
import{nativeReleaseFixture}from'./__tests__/nativeReleaseFixture.js';
import{resetCredentialVaultRuntimeForTests}from'../integrations/credentialVaultRuntime.js';
import{readFileSync}from'node:fs';import vm from'node:vm';import ts from'typescript';import{AuthorityError}from'../../security/authority/enforce.js';

test('desktop release prepares exact immutable-source consent before creating a tag or dispatching Actions',async t=>{
 const owner=randomUUID(),actor=createTenantContext({userId:owner,via:'remote_getuser'}),fixture=nativeReleaseFixture(owner),env={NODE_ENV:'test',SUPABASE_URL:'https://desktop-workflow-fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-store',XROGA_TEST_CREDENTIAL_KEK:Buffer.alloc(32,38).toString('base64url')},prior=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);resetCredentialVaultRuntimeForTests();let writes=0;
 t.after(()=>{resetCredentialVaultRuntimeForTests();for(const[k,v]of Object.entries(prior))if(v===undefined)delete process.env[k];else process.env[k]=v;});
 const sha='a'.repeat(40),workflow='name: Release\non:\n  push:\n    tags: ["v*"]\n';
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  const url=new URL(String(input));if(url.origin===env.SUPABASE_URL)return await fixture.database(url,init)??Response.json({user_id:owner,provider:'github',access_token:'synthetic-desktop-credential',credential_revision:'original',metadata:{}});
  assert.equal(url.origin,'https://api.github.com');if(init?.method==='POST'){writes++;return Response.json({sha,ref:'refs/tags/v1.0.0',object:{sha}});}
  if(url.pathname==='/repos/Owner/repo')return Response.json({full_name:'Owner/repo',permissions:{push:true},default_branch:'main'});
  if(url.pathname.includes('/contents/'))return Response.json({type:'file',name:'release.yml',path:'.github/workflows/release.yml',encoding:'base64',size:Buffer.byteLength(workflow),content:Buffer.from(workflow).toString('base64')});
  if(url.pathname.includes('/git/ref/tags/'))return new Response(null,{status:404});
  return Response.json({sha,object:{sha},tree:{sha:'b'.repeat(40)}});
 });
 const result=await triggerElectronDesktopRelease({userId:owner,tenantContext:actor,repoFullName:'Owner/repo',commitSha:sha});
 assert.equal((result as{needsConfirmation?:boolean}).needsConfirmation,true);assert.equal(writes,0);assert.ok(fixture.row);
});

test('pipeline exposes independent release review without starting it or borrowing pending publication authority',async()=>{
 const text=readFileSync(new URL('../../ai/pipeline.ts',import.meta.url),'utf8'),ast=ts.createSourceFile('pipeline.ts',text,ts.ScriptTarget.Latest,true);let block:ts.Block|undefined;
 function visit(node:ts.Node){if(ts.isTryStatement(node)&&node.tryBlock.statements.some(statement=>ts.isVariableStatement(statement)&&statement.declarationList.declarations.some(item=>item.name.getText(ast)==='signing')))block=node.tryBlock;ts.forEachChild(node,visit);}visit(ast);assert.ok(block);
 const source=ts.transpileModule('(async()=>'+block.getText(ast)+')',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,events:unknown[]=[];let preparations=0,denied=false;
 const context:Record<string,unknown>={opts:{userId:'owner',projectId:'project'},tenantContext:{},githubRepoName:'Owner/repo',commitSha:'a'.repeat(40),nativePublicationPending:true,electronZipOk:false,electronReleaseError:undefined,desktopReleaseTag:undefined,desktopActionsUrl:undefined,desktopReleasesUrl:undefined,todos:()=>[],emit:(event:unknown)=>events.push(event),syncElectronSigningSecretsToGitHub:async()=>{if(denied)throw new AuthorityError('SIGNING_MATERIAL_ADMISSION_DENIED');return{ok:true,synced:[]};},triggerElectronDesktopRelease:async()=>{preparations++;return{ok:false,needsConfirmation:true,reviewUrl:'/dashboard/actions/confirm/11111111-1111-4111-8111-111111111111'};},waitForDesktopReleaseZip:async()=>{throw Error('Pending approval must not poll or claim execution');}};
 vm.runInNewContext('globalThis.run='+source,context);await(context.run as()=>Promise<void>)();assert.equal(preparations,1);assert.equal(context.nativePublicationPending,true);assert.match(JSON.stringify(events),/confirmation_required/);assert.equal(context.electronReleaseError,undefined);
 denied=true;const before=preparations;await assert.rejects((context.run as()=>Promise<void>)());assert.equal(preparations,before,'Signing security denial never becomes a release fallback');
});

for(const scenario of ['success','restart','source-network','source-json','cancel-at-audit','cancel-after-claim','audit-fail','connection-changed','project-owner-changed','workflow-changed','changed-plan','existing-tag-at-audit','provider403','provider503','bad-tag-receipt'] as const){
 test(`desktop exact workflow admission: ${scenario}`,async t=>{
  const owner=randomUUID(),actor=createTenantContext({userId:owner,via:'remote_getuser'}),fixture=nativeReleaseFixture(owner),env={NODE_ENV:'test',SUPABASE_URL:'https://desktop-workflow-fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-store',XROGA_TEST_CREDENTIAL_KEK:Buffer.alloc(32,38).toString('base64url')},prior=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);resetCredentialVaultRuntimeForTests();
  t.after(()=>{resetCredentialVaultRuntimeForTests();for(const[k,v]of Object.entries(prior))if(v===undefined)delete process.env[k];else process.env[k]=v;});
  const sha='a'.repeat(40),tag='v1.0.0',paths:string[]=[],originalWorkflow='name: Release\non:\n  push:\n    tags: ["v*"]\n';let workflow=originalWorkflow,connection='original',writes=0,tagged=false,recovery=false;
  const tagReceipt=()=>({ref:'refs/tags/'+tag,object:{sha,type:'commit'}});
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
   const url=new URL(String(input));
   if(url.origin===env.SUPABASE_URL){const response=await fixture.database(url,init);if(response){if(url.pathname.endsWith('/production_audit_log')&&scenario==='existing-tag-at-audit')tagged=true;return response;}return Response.json({user_id:owner,provider:'github',access_token:'synthetic-desktop-credential',credential_revision:connection,metadata:{}});}
   assert.equal(url.origin,'https://api.github.com');paths.push(url.pathname);assert.equal(init?.redirect,'manual');
   if(init?.method==='POST'){
    writes++;assert.equal(url.pathname,'/repos/Owner/repo/git/refs');assert.deepEqual(JSON.parse(String(init.body)),{ref:'refs/tags/'+tag,sha});
    if(scenario==='provider403')return Response.json({message:'synthetic-desktop-credential'},{status:403});
    if(scenario==='provider503'&&!recovery)return Response.json({message:'synthetic-desktop-credential'},{status:503});
    tagged=true;return Response.json(scenario==='bad-tag-receipt'?{ref:'refs/tags/'+tag,object:{sha:'b'.repeat(40),type:'commit'}}:tagReceipt(),{status:201});
   }
   if(url.pathname==='/repos/Owner/repo')return Response.json({full_name:'Owner/repo',permissions:{push:true},default_branch:'main'});
   if(url.pathname.includes('/contents/')){if(scenario==='source-network')throw Error('synthetic-desktop-credential');if(scenario==='source-json')return new Response('synthetic-desktop-credential');return Response.json({type:'file',name:'release.yml',path:'.github/workflows/release.yml',encoding:'base64',size:Buffer.byteLength(workflow),content:Buffer.from(workflow).toString('base64')});}
   if(url.pathname.includes('/git/ref/tags/'))return tagged?Response.json(tagReceipt()):new Response(null,{status:404});
   return Response.json({sha});
  });
  const opts={userId:owner,tenantContext:actor,repoFullName:'Owner/repo',commitSha:sha};if(['source-network','source-json'].includes(scenario)){await assert.rejects(triggerElectronDesktopRelease(opts),error=>{assert.doesNotMatch(String(error),/synthetic-desktop-credential/);return true;});assert.equal(writes,0);assert.equal(fixture.row,null);return;}const pending=await triggerElectronDesktopRelease(opts);assert.equal(pending.needsConfirmation,true);assert.equal(writes,0);assert.ok(fixture.row);const id=fixture.row.id;
  if(['cancel-at-audit','cancel-after-claim','audit-fail'].includes(scenario))fixture.mode=scenario;
  if(scenario==='connection-changed')connection='new-revision';
  if(scenario==='project-owner-changed')fixture.projectOwner=randomUUID();
  if(scenario==='workflow-changed')workflow+='\nChanged exact source\n';
  if(scenario==='changed-plan')fixture.row.plan.arguments.tag='v2.0.0';
  if(scenario==='restart')resetCredentialVaultRuntimeForTests();
  if(['success','restart'].includes(scenario)){const result=await confirmBusinessAction(actor,id);assert.equal(fixture.row?.status,'consumed');assert.equal(writes,1);const data=JSON.parse(result.execution.resultText);assert.equal(data.requested,true);assert.equal(data.commitSha,sha);assert.equal(data.installerUrls,undefined);assert.doesNotMatch(result.execution.resultText,/synthetic-desktop-credential/);}
  else{await assert.rejects(confirmBusinessAction(actor,id));assert.notEqual(fixture.row?.status,'consumed');assert.equal(writes,['provider403','provider503','bad-tag-receipt'].includes(scenario)?1:0);}
  const before=writes;await assert.rejects(confirmBusinessAction(actor,id));assert.equal(writes,before);assert.ok(!paths.some(path=>path.includes('/dispatches')||path.includes('/git/tags')),'No alternate workflow, branch or annotated-tag fallback');
  if(scenario==='provider503'){recovery=true;const next=await triggerElectronDesktopRelease(opts);assert.equal(next.needsConfirmation,true);assert.ok(fixture.row);await confirmBusinessAction(actor,fixture.row.id);assert.equal(writes,2);}
 });
}

test('desktop release polling requires the exact tag, current owner and immutable commit, never latest',async t=>{
 const owner=randomUUID(),actor=createTenantContext({userId:owner,via:'remote_getuser'}),fixture=nativeReleaseFixture(owner),env={NODE_ENV:'test',SUPABASE_URL:'https://desktop-workflow-fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-store'},prior=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);t.after(()=>{for(const[k,v]of Object.entries(prior))if(v===undefined)delete process.env[k];else process.env[k]=v;});
 const sha='a'.repeat(40),tag='v1.0.0',paths:string[]=[];let mode='ok',tagReads=0,controller=new AbortController();
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  const url=new URL(String(input));if(url.origin===env.SUPABASE_URL)return await fixture.database(url,init)??Response.json({user_id:owner,provider:'github',access_token:'synthetic-desktop-credential',credential_revision:'original',metadata:{}});
  assert.equal(url.origin,'https://api.github.com');paths.push(url.pathname);assert.notEqual(url.pathname,'/repos/Owner/repo/releases/latest');
  if(url.pathname.includes('/git/ref/tags/')){tagReads++;return Response.json({ref:'refs/tags/'+tag,object:{sha:mode==='changed-tag'&&tagReads>1?'b'.repeat(40):sha,type:'commit'}});}
  if(mode==='provider403')return new Response(null,{status:403});if(mode==='outage')return new Response(null,{status:503});
  if(mode==='cancelled')controller.abort();
  if(mode==='network')throw Error('synthetic-desktop-credential');
  if(mode==='stream')return new Response(new ReadableStream({start(c){c.error(Error('synthetic-desktop-credential'));}}));
  if(mode==='malformed-json')return new Response('synthetic-desktop-credential');
  return Response.json({tag_name:mode==='wrong-release'?'v9.0.0':tag,html_url:`https://github.com/Owner/repo/releases/tag/${tag}`,draft:false,assets:[{id:1,name:mode==='credential-asset'?'synthetic-desktop-credential.exe':'fixture.exe',state:'uploaded',size:128,browser_download_url:mode==='foreign-asset'?'https://attacker.example/fixture.exe':`https://github.com/Owner/repo/releases/download/${tag}/${mode==='credential-asset'?'synthetic-desktop-credential.exe':'fixture.exe'}`}]});
 });
 const opts=()=>({userId:owner,tenantContext:actor,repoFullName:'Owner/repo',tag,commitSha:sha,signal:controller.signal,timeoutMs:10000});
 for(mode of ['wrong-release','foreign-asset','credential-asset','changed-tag','provider403','outage','cancelled','network','stream','malformed-json']){controller=new AbortController();tagReads=0;await assert.rejects(waitForDesktopReleaseZip(opts()),error=>{assert.doesNotMatch(String(error),/synthetic-desktop-credential/);return true;});}
 mode='ok';controller=new AbortController();tagReads=0;const good=await waitForDesktopReleaseZip(opts());assert.equal(good.ok,true);assert.equal(good.installerUrls?.length,1);assert.equal(tagReads,2);
 const before=paths.length;await assert.rejects(waitForDesktopReleaseZip({...opts(),tag:undefined}));await assert.rejects(waitForDesktopReleaseZip({...opts(),commitSha:undefined}));assert.equal(paths.length,before);
});
