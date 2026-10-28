import assert from'node:assert/strict';import{test}from'node:test';import{readFile}from'node:fs/promises';import{createTenantContext,type TenantContext}from'../../security/tenantContext.js';
import{listEasBuilds,waitForEasBuildArtifact}from'./easCredentials.js';import type{ExpoAccess}from'./expoAccess.js';

test('EAS reads and polling retain current owned project, cancellation and exact nonbaseline receipts',async t=>{
 const owner='11111111-1111-4111-8111-111111111111',context=createTenantContext({userId:owner,via:'remote_getuser'}),env={NODE_ENV:'test',SUPABASE_URL:'https://build-fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture'},old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 t.after(()=>{for(const[k,v]of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;});
 let mode='ok',projectReads=0,buildReads=0,graphql=0,reads=0,external=0,defaultProject='project-a';let controller=new AbortController();
 const build=()=>({id:'new-build',app:{id:'project-a'},status:'FINISHED',platform:'ANDROID',createdAt:new Date().toISOString(),artifacts:{buildUrl:'https://expo.dev/artifacts/file.apk'}});
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  const url=new URL(String(input));
  if(url.origin===env.SUPABASE_URL){reads++;const provider=url.searchParams.get('provider')?.slice(3)??'';if(provider==='apikey_expo_project_id')projectReads++;const value=provider==='apikey_expo_project_id'?defaultProject:'expo-token';return Response.json({user_id:owner,provider,credential_revision:null,access_token:'enc:'+Buffer.from('fixture:'+value).toString('base64'),metadata:{}});}
  external++;assert.equal(url.origin,'https://api.expo.dev');assert.equal(init?.redirect,'manual');assert.ok(init?.signal);assert.equal(new Headers(init?.headers).get('authorization'),'Bearer expo-token');
  let row:Record<string,unknown>=build();if(mode==='foreign')row={...row,app:{id:'project-b'}};if(mode==='old')row={...row,createdAt:'2001-01-01T00:00:00Z'};if(mode==='bad-date')row={...row,createdAt:'invalid'};if(mode==='platform')row={...row,platform:'NOT_ANDROID'};if(mode==='unsafe-url')row={...row,artifacts:{buildUrl:'javascript:alert(1)'}};
  if(url.pathname==='/graphql'){
   const body=JSON.parse(String(init?.body));assert.match(body.query,/^\s*query/);
   if(body.query.includes('XrogaExpoAccountsAdmission'))return Response.json({data:{me:{accounts:[{id:'account',name:'account'}]}}});
   assert.equal(body.variables.appId,'project-a');
   if(body.query.includes('XrogaExpoProjectAdmission'))return Response.json({data:{app:{byId:{id:'project-a',name:'fixture',slug:'fixture',ownerAccount:{id:'account',name:'account'}}}}});
   graphql++;assert.match(body.query,/app \{ id \}/);assert.doesNotMatch(body.query,/edges|node/);
   return Response.json({data:{app:{byId:{id:mode==='foreign-parent'?'project-b':'project-a',builds:[row]}}}});
  }
  assert.equal(url.pathname,'/v2/projects/project-a/builds');buildReads++;
  if(mode==='rest-denied')return Response.json({message:'expo-token'},{status:403});
  if(mode==='fallback'||mode==='foreign-parent')return Response.json({message:'provider unavailable'},{status:404});if(mode==='fallback503')return Response.json({message:'expo-token'},{status:503});
  if(mode==='pin'&&buildReads===1||mode==='cancel-pause')row={...row,status:'IN_PROGRESS'};
  if(mode==='default-change')defaultProject='project-b';if(mode==='cancel-response')controller.abort();
  return Response.json({data:[row]});
 });
 for(const actor of [undefined,{...context}as TenantContext])await t.test('unissued actor never reads a key',async()=>{const before=[reads,external];await assert.rejects(listEasBuilds({userId:owner,tenantContext:actor,projectId:'project-a'}));await assert.rejects(waitForEasBuildArtifact({userId:owner,tenantContext:actor,projectId:'project-a',timeoutMs:1}));assert.deepEqual([reads,external],before);});
 await t.test('serialized session cannot replace the original issued access',async()=>{const before=[reads,external];await assert.rejects(listEasBuilds({userId:owner,tenantContext:context,projectId:'project-a',_access:{context,token:'expo-token'}as ExpoAccess}));assert.deepEqual([reads,external],before);});
 for(mode of ['ok','fallback','fallback503'])await t.test(mode,async()=>{const rows=await listEasBuilds({userId:owner,tenantContext:context,projectId:'project-a'});assert.equal(rows.length,1);assert.equal(rows[0]?.projectId,'project-a');});
 assert.equal(projectReads,0,'An explicit selection never reads an unrelated default project');assert.ok(graphql>0);
 await t.test('one captured default remains current throughout the poll',async()=>{mode='pin';buildReads=0;const result=await waitForEasBuildArtifact({userId:owner,tenantContext:context,platform:'android',ignoreBuildIds:[],startedAfterMs:Date.now()-1000,intervalMs:1,timeoutMs:500});assert.equal(result.ok,true);assert.ok(projectReads>=2);assert.ok(buildReads>=2);});
 await t.test('a changed default cannot silently rebind or continue a pending poll',async()=>{mode='default-change';buildReads=0;defaultProject='project-a';await assert.rejects(waitForEasBuildArtifact({userId:owner,tenantContext:context,ignoreBuildIds:[],intervalMs:1,timeoutMs:500}));assert.equal(buildReads,1);defaultProject='project-a';});
 for(mode of ['foreign','foreign-parent','bad-date','platform','unsafe-url','rest-denied'])await t.test(mode+' is terminal without read fallback',async()=>{const before=graphql;await assert.rejects(listEasBuilds({userId:owner,tenantContext:context,projectId:'project-a'}));assert.equal(graphql-before,mode==='foreign-parent'?1:0);});
 for(mode of ['old','ok'])await t.test(mode+' cannot fabricate a new finished build',async()=>{const result=await waitForEasBuildArtifact({userId:owner,tenantContext:context,projectId:'project-a',platform:'android',ignoreBuildIds:mode==='ok'?['new-build']:[],startedAfterMs:Date.now()-1000,intervalMs:1,timeoutMs:30});assert.equal(result.ok,false);});
 await t.test('cancellation during a response stops further requests',async()=>{mode='cancel-response';controller=new AbortController();buildReads=0;await assert.rejects(waitForEasBuildArtifact({userId:owner,tenantContext:context,signal:controller.signal,projectId:'project-a',ignoreBuildIds:[],intervalMs:1,timeoutMs:500}));assert.equal(buildReads,1);});
 await t.test('cancellation clears the waiting poll timer',async()=>{
  mode='cancel-pause';controller=new AbortController();buildReads=0;const native=globalThis.setTimeout;let waited=false;
  const patch=t.mock.method(globalThis,'setTimeout',((callback:()=>void,ms?:number,...args:unknown[])=>{const timer=Reflect.apply(native,globalThis,[callback,ms,...args]);if(ms===31415){waited=true;queueMicrotask(()=>controller.abort());}return timer;})as typeof setTimeout);
  try{await assert.rejects(waitForEasBuildArtifact({userId:owner,tenantContext:context,signal:controller.signal,projectId:'project-a',ignoreBuildIds:[],intervalMs:31415,timeoutMs:60000}));assert.equal(waited,true);assert.equal(buildReads,1);}finally{patch.mock.restore();}
 });
 const pipeline=await readFile(new URL('../../ai/pipeline.ts',import.meta.url),'utf8');assert.match(pipeline,/waitForEasBuildArtifact\(\{\s*userId: opts.userId,\s*projectId: eas.projectId/);assert.match(pipeline,/waitForEasBuildArtifact\(\{\s*userId: opts.userId,\s*projectId: easIos.projectId/);
});
