import test from 'node:test';import assert from 'node:assert/strict';import{randomUUID,createHash}from'node:crypto';
import{createTenantContext}from'../../security/tenantContext.js';
import{pushBuildToGitHub,rollbackRepoToCommit}from'./githubDeploy.js';
import{exportTemplateToRepo}from'../showcase/templateExport.js';
import{confirmBusinessAction}from'./businessActionConfirmations.js';
import{nativeReleaseFixture}from'../publish/__tests__/nativeReleaseFixture.js';
import{resetCredentialVaultRuntimeForTests}from'./credentialVaultRuntime.js';

for(const scenario of ['push','feature','template','restore','create','empty','cancel-at-audit','cancel-after-claim','audit-fail','changed-connection','changed-head','403','503','bad-blob','bad-ref','cancel-after-blob','secret-source','foreign-project','changed-plan','changed-visibility','template-branch-exists','template-truncated','template-secret','replay'] as const){
 test('exact GitHub publication: '+scenario,async t=>{
  const owner=randomUUID(),actor=createTenantContext({userId:owner,via:'remote_getuser'}),fixture=nativeReleaseFixture(owner),env={NODE_ENV:'test',SUPABASE_URL:'https://github-publication-fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-store',XROGA_TEST_CREDENTIAL_KEK:Buffer.alloc(32,47).toString('base64url')},prior=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);resetCredentialVaultRuntimeForTests();t.after(()=>{resetCredentialVaultRuntimeForTests();for(const[k,v]of Object.entries(prior))if(v===undefined)delete process.env[k];else process.env[k]=v;});
  const token='synthetic-publish-credential',old='a'.repeat(40),tree='b'.repeat(40),createdTree='c'.repeat(40),createdCommit='d'.repeat(40),restoredCommit='e'.repeat(40);let recovered=false;let head=old,revision='original',writes=0,repoExists=scenario!=='create',empty=scenario==='empty'||scenario==='create',featureExists=false;
  const mutations:Array<{path:string;body:Record<string,unknown>}>=[];
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
   const url=new URL(String(input)),method=init?.method??'GET';
   if(url.origin===env.SUPABASE_URL){const res=await fixture.database(url,init);if(res)return res;if(url.pathname.endsWith('/github_integrations')&&method==='PATCH')return Response.json([{user_id:owner}]);return Response.json({user_id:owner,provider:'github',access_token:token,credential_revision:revision,metadata:{},default_repo:null});}
   assert.equal(url.origin,'https://api.github.com');assert.equal(init?.redirect,'manual');assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+token);
   const path=url.pathname,body=init?.body?JSON.parse(String(init.body)) as Record<string,any>:{};
   if(method!=='GET'){
    writes++;mutations.push({path,body});if(scenario==='403')return Response.json({message:token},{status:403});if(scenario==='503'&&!recovered)return Response.json({message:token},{status:503});
    if(path==='/user/repos'){assert.deepEqual(body,{name:'release',private:true,auto_init:false,description:'Built with Xroga'});repoExists=true;return Response.json({full_name:'Owner/release',private:true,default_branch:'main'},{status:201});}
    if(path.endsWith('/contents/.xroga/bootstrap')){empty=false;return Response.json({commit:{sha:old}},{status:201});}
    if(path.endsWith('/git/blobs')){if(scenario==='cancel-after-blob'&&fixture.row)fixture.row.status='cancelled';const bytes=Buffer.from(body.content,'base64'),sha=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');return Response.json({sha:scenario==='bad-blob'?'f'.repeat(40):sha},{status:201});}
    if(path.endsWith('/git/trees')){assert.equal(body.base_tree,tree);return Response.json({sha:createdTree},{status:201});}
    if(path.endsWith('/git/commits')){assert.deepEqual(body.parents,[old]);return Response.json({sha:createdCommit,tree:{sha:body.tree},parents:[{sha:old}]},{status:201});}
    if(path.endsWith('/git/refs')){featureExists=true;return Response.json({ref:body.ref,object:{sha:old,type:'commit'}},{status:201});}
    if(method==='PATCH'){assert.equal(body.force,false);assert.equal(body.sha,createdCommit);head=createdCommit;return Response.json({ref:'refs/heads/'+(scenario==='feature'?'xroga/test-run':scenario==='template'?'xroga/template-business-abc':'main'),object:{sha:scenario==='bad-ref'?'f'.repeat(40):head,type:'commit'}});}
    if(path.endsWith('/pulls'))return Response.json({number:17,html_url:'https://github.com/Owner/repo/pull/17'},{status:201});
    throw Error('Unexpected synthetic mutation '+path);
   }
   if(path==='/user')return Response.json({login:'Owner'});
   if(/^\/repos\/Owner\/[^/]+$/.test(path))return repoExists?Response.json({full_name:path.slice(7),permissions:{push:true},default_branch:'main',private:scenario==='changed-visibility'&&fixture.row?false:true}):new Response(null,{status:404});
   if(path.endsWith('/commits'))return empty?Response.json({message:'Empty'},{status:409}):Response.json([{sha:head}]);
   if(path.includes('/branches/'))return Response.json({protected:false});
   if(path.includes('/git/ref/heads/')){if((path.endsWith('/xroga/test-run')||path.endsWith('/xroga/template-business-abc')||path.endsWith('/xroga%2Ftemplate-business-abc'))&&!featureExists&&scenario!=='template-branch-exists')return new Response(null,{status:404});if(empty)return Response.json({message:'Empty'},{status:409});return Response.json({object:{sha:head,type:'commit'}});}
   if(path.includes('/git/commits/'))return Response.json({tree:{sha:path.endsWith(restoredCommit)?createdTree:tree}});
   if(path.includes('/git/trees/'))return Response.json({sha:tree,truncated:scenario==='template-truncated',tree:scenario==='empty'||scenario==='create'?[{path:'.xroga',type:'tree',mode:'040000',sha:'f'.repeat(40)},{path:'.xroga/bootstrap',type:'blob',mode:'100644',sha:'f'.repeat(40)}]:[]});
   throw Error('Unexpected synthetic read '+path);
  });
  const files=[{path:'index.html',content:'owned source'}],opts={tenantContext:actor,targetRepo:scenario==='create'?undefined:'Owner/repo',targetBranch:'main',directWriteAuthorized:scenario!=='feature',runId:'test-run',slug:'release',allowEmptyBootstrap:true};
  await assert.rejects(pushBuildToGitHub(owner,files,{...opts,tenantContext:{...actor}}));assert.equal(writes,0);
  if(scenario==='secret-source'){await assert.rejects(pushBuildToGitHub(owner,[{path:'index.html',content:token}],opts));assert.equal(writes,0);assert.equal(fixture.row,null);return;}
  if(scenario==='foreign-project'){fixture.projectOwner=randomUUID();await assert.rejects(pushBuildToGitHub(owner,files,{...opts,projectId:fixture.project}));assert.equal(writes,0);assert.equal(fixture.row,null);return;}
  if(['template-branch-exists','template-truncated','template-secret'].includes(scenario)){await assert.rejects(exportTemplateToRepo({userId:owner,tenantContext:actor,templateId:'business-website',repoFullName:'Owner/repo',branch:'xroga/template-business-abc',projectName:'Owned',...(scenario==='template-secret'?{userPrompt:token}:{})}));assert.equal(writes,0);assert.equal(fixture.row,null);return;}
  const pending=scenario==='template'?await exportTemplateToRepo({userId:owner,tenantContext:actor,templateId:'business-website',repoFullName:'Owner/repo',branch:'xroga/template-business-abc',projectName:'Synthetic owned template'}):scenario==='restore'?await rollbackRepoToCommit(owner,'Owner/repo',restoredCommit,'main',actor):await pushBuildToGitHub(owner,files,opts);assert.equal(pending.needsConfirmation,true);assert.equal(writes,0);assert.ok(fixture.row);const id=fixture.row.id;
  if(['cancel-at-audit','cancel-after-claim','audit-fail'].includes(scenario))fixture.mode=scenario;
  if(scenario==='changed-plan')fixture.row.plan.arguments.branch='other';
  if(scenario==='changed-connection')revision='changed';if(scenario==='changed-head')head='f'.repeat(40);
  const positive=['push','feature','template','restore','create','empty','replay'].includes(scenario);
  if(positive){const result=await confirmBusinessAction(actor,id);assert.equal(result.execution.status,'success');assert.equal(head,createdCommit);assert.equal(fixture.row.status,'consumed');const before=writes;await assert.rejects(confirmBusinessAction(actor,id));assert.equal(writes,before);}
  else{await assert.rejects(confirmBusinessAction(actor,id),error=>{assert.doesNotMatch(String(error),new RegExp(token));return true;});if(['cancel-at-audit','cancel-after-claim','audit-fail','changed-connection','changed-head','changed-plan','changed-visibility'].includes(scenario))assert.equal(writes,0);if(scenario==='cancel-after-blob'||scenario==='bad-blob')assert.equal(mutations.some(m=>m.path.endsWith('/git/refs/heads/main')),false);}
  if(scenario==='503'){const before=writes;await assert.rejects(confirmBusinessAction(actor,id));assert.equal(writes,before);recovered=true;await pushBuildToGitHub(owner,files,opts);assert.ok(fixture.row);await confirmBusinessAction(actor,fixture.row.id);assert.equal(head,createdCommit);}
  if(scenario==='restore')assert.equal(mutations.some(m=>m.body.force===true),false);
 });
}
