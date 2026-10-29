import test from 'node:test';
import assert from 'node:assert/strict';
import {AuthorityError} from '../security/authority/enforce.js';
import {createRestGitHubPort} from './github/restPort.js';
import {createRestSupabasePort} from './data/restPort.js';
import {createRestVercelPort} from './hosting/restPort.js';

test('Builder GitHub preserves terminal actor denial instead of provider-unavailable recovery',async()=>{
 await assert.rejects(createRestGitHubPort().viewer('unissued-raw-token'),error=>error instanceof AuthorityError);
});
test('Builder Supabase refuses raw-token transport before any external request',async()=>{
 const old=globalThis.fetch;let dispatches=0;
 globalThis.fetch=async()=>{dispatches++;return Response.json([]);};
 try{await assert.rejects(createRestSupabasePort().listProjects('unissued-raw-token'));assert.equal(dispatches,0);}
 finally{globalThis.fetch=old;}
});
test('newly integrated Builder Vercel transport cannot publish with only a raw token',async()=>{
 const old=globalThis.fetch;let dispatches=0;
 globalThis.fetch=async()=>{dispatches++;return Response.json({id:'project_fixture',name:'fixture',accountId:'user_fixture'});};
 try{await assert.rejects(createRestVercelPort().createProject('unissued-raw-token',{kind:'personal',id:null,slug:'alice',name:'Alice'},{name:'fixture',framework:null}));assert.equal(dispatches,0);}
 finally{globalThis.fetch=old;}
});

import {createHash,randomUUID} from 'node:crypto';
import {createTenantContext} from '../security/tenantContext.js';
import {createBuilderProviderBoundary} from './providerTransports.js';
import {InMemoryBuilderStore} from './store.js';
import {InMemoryPhase2Store} from './phase2Store.js';
import {BuilderService} from './service.js';
import {GitHubExportService} from './github/service.js';
import {SupabaseDataService} from './data/service.js';
import {CATALOG_TABLES_SQL,CATALOG_GRANTS_SQL} from './data/restPort.js';
import {schemaFor,schemaMarker} from './data/schema.js';

async function boundaryFixture(t:import('node:test').TestContext){
 const owner=randomUUID(),other=randomUUID(),context=createTenantContext({userId:owner,via:'remote_getuser'}),origin='https://builder-boundary-fixture.invalid',ref='abcdefghijklmnopqrst';
 const saved={SUPABASE_URL:process.env.SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY};Object.assign(process.env,{SUPABASE_URL:origin,SUPABASE_SERVICE_ROLE_KEY:'synthetic-fixture-store'});
 t.after(()=>{for(const[k,v]of Object.entries(saved))if(v===undefined)delete process.env[k];else process.env[k]=v;});
 const store=new InMemoryBuilderStore(),phase2=new InMemoryPhase2Store(store),builder=new BuilderService({store,runBuild:async()=>null});
 const site=await builder.createProject(owner,{prompt:'Build a modern website for a home renovation company with Home, Services and Contact pages.',requestKey:'site-fixture-0001'});
 const app=await builder.createProject(owner,{prompt:'Build a task-management application with user accounts, dashboard, task creation, editing, completion, deletion, and saved data that remains after a refresh. Different users must not see each other tasks.',requestKey:'app-fixture-00001'});
 const tokens={github:'synthetic-connected-github',supabase_oauth:'synthetic-connected-supabase',vercel:'synthetic-connected-vercel'};
 const state={epoch:'original',mode:'ok',dispatches:0,writes:0,audits:0,auditUnavailable:false,revokeAfterWrite:false,vercelProject:false,vercelProduction:false,vercelMeta:{} as Record<string,string>,catalog:[] as {name:string;rls:boolean;comment:string|null}[],repository:false,head:'a'.repeat(40),tree:'b'.repeat(40),commit:'c'.repeat(40),treeEntries:[] as unknown[],commitParents:[] as string[]};
 const repo=()=>({id:51,full_name:'alice/fixture',name:'fixture',owner:{id:501,login:'alice'},private:true,html_url:'https://github.com/alice/fixture',description:'Generated with Xroga.',default_branch:'main',permissions:{push:true},archived:false,disabled:false});
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  const url=new URL(String(input)),method=init?.method??'GET';
  if(url.origin===origin){
   if(url.pathname==='/rest/v1/production_audit_log'){state.audits++;if(state.auditUnavailable)return Response.json({message:'Unavailable'},{status:503});return Response.json(JSON.parse(String(init?.body)));}
   if(url.pathname==='/rest/v1/github_integrations')return Response.json({user_id:owner,access_token:tokens.github});
   assert.equal(url.pathname,'/rest/v1/user_integrations');assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
   const rows=Object.entries(tokens).map(([provider,access_token])=>({user_id:owner,provider,access_token,refresh_token:null,credential_revision:state.epoch,metadata:{}}));
   const provider=url.searchParams.get('provider');return Response.json(provider?.startsWith('eq.')?rows.find(row=>row.provider===provider.slice(3))??null:rows.filter(row=>provider?.includes(row.provider)));
  }
  state.dispatches++;assert.equal(init?.redirect,'manual');assert.ok(init?.signal);
  if(state.mode==='redirect')return Response.redirect('https://attacker.invalid/',307);
  if(state.mode==='forbidden')return Response.json({message:'SYNTHETIC_PROVIDER_CREDENTIAL_CANARY'},{status:403});
  if(state.mode==='outage')return Response.json({message:'unavailable'},{status:503});
  if(url.origin==='https://api.github.com'){
   assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+tokens.github);
   const path=url.pathname,body=init?.body?JSON.parse(String(init.body)):undefined;
   if(method!=='GET'){state.writes++;if(state.revokeAfterWrite)state.epoch='revoked';}
   if(path==='/user')return Response.json({id:501,login:'alice'},{headers:{'x-oauth-scopes':'repo,read:org'}});
   if(path==='/user/orgs')return Response.json([{id:701,login:'alice-co'}]);
   if(path==='/user/repos'&&method==='POST'){state.repository=true;return Response.json({...repo(),description:body.description},{status:201});}
   if(path==='/repos/alice/fixture')return state.repository?Response.json(repo()):new Response(null,{status:404});
   if(path==='/repos/alice/fixture/git/ref/heads/main')return Response.json({ref:'refs/heads/main',object:{sha:state.head,type:'commit'}});
   if(path.endsWith('/git/blobs')){const data=Buffer.from(body.content,'base64'),sha=createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');return Response.json({sha},{status:201});}
   if(path.endsWith('/git/trees')&&method==='POST'){state.treeEntries=body.tree;return Response.json({sha:state.tree},{status:201});}
   if(path.endsWith('/git/commits')&&method==='POST'){state.commitParents=body.parents;return Response.json({sha:state.commit,tree:{sha:state.tree},parents:body.parents.map((sha:string)=>({sha}))},{status:201});}
   if(path.includes('/git/refs/heads/')&&method==='PATCH'){state.head=body.sha;return Response.json({ref:'refs/heads/main',object:{sha:state.head,type:'commit'}});}
   if(path.endsWith('/git/commits/'+state.commit))return Response.json({tree:{sha:state.tree}});
   if(path.endsWith('/git/trees/'+state.tree))return Response.json({truncated:false,tree:state.treeEntries});
   throw Error('Unexpected GitHub fixture request '+path);
  }
  if(url.origin==='https://api.vercel.com'){
   assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+tokens.vercel);
   const path=url.pathname,body=init?.body?JSON.parse(String(init.body)):undefined;
   const project={id:'prj_fixture',name:'fixture',accountId:'user_fixture',framework:null};
   const deployment={id:'dpl_fixture',url:'fixture-preview.vercel.app',readyState:'READY',target:state.vercelProduction?'production':null,projectId:'prj_fixture',meta:state.vercelMeta};
   if(path==='/v2/user')return Response.json({user:{id:'user_fixture',username:'alice'}});
   if(path==='/v2/teams')return Response.json({teams:[]});
   if(path==='/v9/projects/fixture')return state.vercelProject?Response.json(project):new Response(null,{status:404});
   if(method==='POST'){state.writes++;if(state.revokeAfterWrite)state.epoch='revoked';}
   if(path==='/v11/projects'){state.vercelProject=true;return Response.json(project,{status:201});}
   if(path==='/v13/deployments'&&method==='POST'){state.vercelMeta=body.meta;return Response.json({...deployment,meta:body.meta},{status:201});}
   if(path==='/v13/deployments/dpl_fixture')return Response.json(deployment);
   if(path==='/v10/projects/prj_fixture/promote/dpl_fixture'){state.vercelProduction=true;return Response.json({ok:true},{status:201});}
   throw Error('Unexpected Vercel fixture request '+path);
  }
  assert.equal(url.origin,'https://api.supabase.com');assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+tokens.supabase_oauth);
  if(url.pathname==='/v1/projects')return Response.json([{id:ref,ref,name:'Synthetic App',organization_id:'org-fixture',region:'us-east-1'}]);
  if(url.pathname.endsWith('/api-keys')){assert.equal(url.search,'?reveal=false');return Response.json([{type:'publishable',api_key:'sb_publishable_synthetic_fixture'}]);}
  const body=JSON.parse(String(init?.body));
  if(body.query===CATALOG_TABLES_SQL)return Response.json(state.catalog);
  if(body.query===CATALOG_GRANTS_SQL)return Response.json([]);
  assert.ok(body.query.startsWith('begin;\n'));state.writes++;if(state.revokeAfterWrite)state.epoch='revoked';const project=await builder.requireProject(owner,app.project.id),schema=schemaFor(project.spec)!;state.catalog=schema.tables.map(name=>({name,rls:true,comment:schemaMarker(schema.archetype)}));return Response.json([]);
 });
 let github:GitHubExportService;
 const boundary=()=>createBuilderProviderBoundary(context,{phase2,builder,githubFiles:async op=>{const project=await builder.requireProject(owner,op.projectId),revision=await builder.revisionFiles(owner,op.projectId,op.revisionId);assert.ok(revision);return github.filesFor(project,revision);}});
 const bind=()=>{const b=boundary();github=new GitHubExportService({phase2,builder,github:createRestGitHubPort(b.github),tokenFor:b.githubTokenFor,admission:b.githubAdmission});return{b,github,data:new SupabaseDataService({phase2,builder,supabase:createRestSupabasePort(b.supabase),tokenFor:b.supabaseTokenFor,admission:b.supabaseAdmission})};};
 return{owner,other,context,store,phase2,builder,site,app,state,tokens,ref,bind};
}

test('production Builder wiring retains exact approved GitHub publication, readback, replay and organization targets',async t=>{
 const h=await boundaryFixture(t),{github}=h.bind();assert.deepEqual((await github.targets(h.owner)).owners.map(o=>o.login),['alice','alice-co']);
 const prepared=await github.prepareCreate(h.owner,h.site.project.id,{operationKey:'create-fixture-0001',owner:'alice',repositoryName:'fixture'});assert.equal(h.state.writes,0);
 await assert.rejects(github.execute(h.owner,h.site.project.id,prepared.operation.id));assert.equal(h.state.writes,0);
 await github.approve(h.owner,h.site.project.id,prepared.operation.id,{digest:prepared.operation.planDigest});assert.equal(h.state.writes,0);
 const result=await github.execute(h.owner,h.site.project.id,prepared.operation.id);assert.equal(result.status,'succeeded');assert.ok(h.state.audits>0);const writes=h.state.writes;
 assert.equal((await github.execute(h.owner,h.site.project.id,prepared.operation.id)).id,result.id);assert.equal(h.state.writes,writes);
 await assert.rejects(github.targets(h.other));
});

test('production Builder Supabase selection and exact reviewed migration retain RLS and public-only configuration',async t=>{
 const h=await boundaryFixture(t),{data}=h.bind();const bind=await data.prepareBind(h.owner,h.app.project.id,{operationKey:'bind-fixture-00001',projectRef:h.ref});
 await data.approve(h.owner,h.app.project.id,bind.operation.id,bind.operation.planDigest);assert.equal((await data.executeBind(h.owner,h.app.project.id,bind.operation.id)).status,'succeeded');assert.equal(h.state.writes,0);
 const prepared=await data.prepareMigration(h.owner,h.app.project.id,{operationKey:'migration-fixture-00001'});await data.approve(h.owner,h.app.project.id,prepared.operation.id,prepared.operation.planDigest);
 assert.equal((await data.executeMigration(h.owner,h.app.project.id,prepared.operation.id)).status,'succeeded');assert.equal(h.state.writes,1);const writes=h.state.writes;
 await data.executeMigration(h.owner,h.app.project.id,prepared.operation.id);assert.equal(h.state.writes,writes);assert.ok((await data.appEnvironment(h.owner,h.app.project.id))?.VITE_SUPABASE_ANON_KEY||await data.appEnvironment(h.owner,h.app.project.id));
});

test('credential epoch replacement after approval fails before any GitHub write even with the same token',async t=>{
 const h=await boundaryFixture(t),{github}=h.bind(),p=await github.prepareCreate(h.owner,h.site.project.id,{operationKey:'epoch-fixture-0001',owner:'alice',repositoryName:'fixture'});await github.approve(h.owner,h.site.project.id,p.operation.id,{digest:p.operation.planDigest});h.state.epoch='replacement';await assert.rejects(h.bind().github.execute(h.owner,h.site.project.id,p.operation.id));assert.equal(h.state.writes,0);
});

test('durable cancellation, foreign ownership and a failed security receipt cannot reach provider writes',async t=>{
 const h=await boundaryFixture(t);let {github}=h.bind();const p=await github.prepareCreate(h.owner,h.site.project.id,{operationKey:'cancel-fixture-0001',owner:'alice',repositoryName:'fixture'});await github.approve(h.owner,h.site.project.id,p.operation.id,{digest:p.operation.planDigest});await github.cancel(h.owner,h.site.project.id,p.operation.id);await assert.rejects(github.execute(h.owner,h.site.project.id,p.operation.id));await assert.rejects(github.execute(h.other,h.site.project.id,p.operation.id));assert.equal(h.state.writes,0);
 ({github}=h.bind());const q=await github.prepareCreate(h.owner,h.site.project.id,{operationKey:'audit-fixture-00001',owner:'alice',repositoryName:'fixture'});await github.approve(h.owner,h.site.project.id,q.operation.id,{digest:q.operation.planDigest});h.state.auditUnavailable=true;await assert.rejects(github.execute(h.owner,h.site.project.id,q.operation.id));assert.equal(h.state.writes,0);
});

test('revocation during publication prevents all subsequent mutations and automatic retry',async t=>{
 const h=await boundaryFixture(t),{github}=h.bind(),p=await github.prepareCreate(h.owner,h.site.project.id,{operationKey:'revoke-fixture-0001',owner:'alice',repositoryName:'fixture'});await github.approve(h.owner,h.site.project.id,p.operation.id,{digest:p.operation.planDigest});h.state.revokeAfterWrite=true;await assert.rejects(github.execute(h.owner,h.site.project.id,p.operation.id));assert.equal(h.state.writes,1);await assert.rejects(github.execute(h.owner,h.site.project.id,p.operation.id));assert.equal(h.state.writes,1);
});

test('redirect and provider authorization denial are terminal while an ordinary read outage can recover',async t=>{
 const h=await boundaryFixture(t);for(const mode of ['redirect','forbidden']){const {github}=h.bind();h.state.mode=mode;await assert.rejects(github.targets(h.owner),e=>{assert.doesNotMatch(String(e),/SYNTHETIC_PROVIDER_CREDENTIAL_CANARY/);return true;});}
 h.state.mode='outage';const {github}=h.bind();await assert.rejects(github.targets(h.owner));h.state.mode='ok';assert.equal((await github.targets(h.owner)).connected,true);assert.equal(h.state.writes,0);
});

import {HostingService} from './hosting/service.js';
import {createBuilderVercelBoundary} from './hosting/authority.js';

function hostingFor(h:Awaited<ReturnType<typeof boundaryFixture>>,environment:()=>Promise<Record<string,string>|null>=async()=>null){
 const {github}=h.bind();
 const v=createBuilderVercelBoundary(h.context,{phase2:h.phase2,builder:h.builder,filesFor:async op=>{const project=await h.builder.requireProject(h.owner,op.projectId),revision=await h.builder.revisionFiles(h.owner,op.projectId,op.revisionId);assert.ok(revision);return github.filesFor(project,revision);},appEnvironment:environment});
 const hosting=new HostingService({phase2:h.phase2,builder:h.builder,vercel:createRestVercelPort(v.transport),tokenFor:v.tokenFor,admission:v.admission,appEnvironment:environment,filesFor:(project,revision)=>github.filesFor(project,revision),githubCommitFor:async()=>null,databaseStatus:async()=>({required:false,applied:false}),remoteQa:async()=>({status:'passed',executedChecks:8,failedChecks:0,reason:'Controlled fixture, no live deployment or model call.'}),probe:async()=>({status:200,bytes:1,protectedBySso:false,errorMarker:null})});
 return{v,hosting};
}

test('new Builder hosting caller preserves separate preview and typed production approval under canonical egress',async t=>{
 const h=await boundaryFixture(t),{hosting}=hostingFor(h);
 const p=await hosting.preparePreview(h.owner,h.site.project.id,{operationKey:'preview-fixture-0001',scopeId:null,projectName:'fixture'});assert.equal(h.state.writes,0);
 await hosting.approve(h.owner,h.site.project.id,p.operation.id,p.operation.planDigest);assert.equal(h.state.writes,0);
 const preview=await hosting.executePreview(h.owner,h.site.project.id,p.operation.id);assert.equal(preview.status,'succeeded');assert.equal(h.state.vercelProduction,false);
 const promotion=await hosting.preparePromotion(h.owner,h.site.project.id,{operationKey:'promote-fixture-0001',previewOperationId:preview.id});
 const count=h.state.writes;await assert.rejects(hosting.approvePromotion(h.owner,h.site.project.id,promotion.operation.id,{digest:promotion.operation.planDigest,confirmation:'wrong'}));assert.equal(h.state.writes,count);
 await hosting.approvePromotion(h.owner,h.site.project.id,promotion.operation.id,{digest:promotion.operation.planDigest,confirmation:promotion.plan.confirmationPhrase});assert.equal(h.state.vercelProduction,false);
 assert.equal((await hosting.executePromotion(h.owner,h.site.project.id,promotion.operation.id)).status,'succeeded');assert.equal(h.state.vercelProduction,true);assert.ok(h.state.audits>=2);
});

test('new Builder hosting transport denies changed credentials, substituted body and unapproved publication',async t=>{
 const h=await boundaryFixture(t),{hosting,v}=hostingFor(h);const p=await hosting.preparePreview(h.owner,h.site.project.id,{operationKey:'vercel-epoch-0001',scopeId:null,projectName:'fixture'});await hosting.approve(h.owner,h.site.project.id,p.operation.id,p.operation.planDigest);
 await assert.rejects(v.transport(h.tokens.vercel,'/v13/deployments',{method:'POST',body:JSON.stringify({name:'foreign',target:'production'})}));assert.equal(h.state.writes,0);
 h.state.epoch='replacement';await assert.rejects(hostingFor(h).hosting.executePreview(h.owner,h.site.project.id,p.operation.id));assert.equal(h.state.writes,0);
});
