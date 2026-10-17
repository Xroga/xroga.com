import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {listEasBuilds,waitForEasBuildArtifact} from './easCredentials.js';

test('EAS polling pins project and admits only exact recent nonbaseline build evidence',async t=>{
  const names=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'],before=names.map(n=>process.env[n]);
  process.env.SUPABASE_URL='https://build-fixture.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture';
  t.after(()=>names.forEach((n,i)=>{if(before[i]===undefined)delete process.env[n];else process.env[n]=before[i];}));
  let mode='ok',projectReads=0,buildReads=0,graphql=0;
  const build=()=>({id:'new-build',app:{id:'project-a'},status:'FINISHED',platform:'ANDROID',createdAt:new Date().toISOString(),artifacts:{buildUrl:'https://expo.dev/artifacts/file.apk'}});
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    const url=new URL(String(input));
    if(url.origin==='https://build-fixture.invalid'){
      let value='expo-token';if(url.searchParams.get('provider')==='eq.apikey_expo_project_id'){projectReads++;value=projectReads===1?'project-a':'project-b';}
      return Response.json({access_token:`enc:${Buffer.from(`fixture:${value}`).toString('base64')}`,metadata:{}});
    }
    assert.equal(url.origin,'https://api.expo.dev');
    let row:Record<string,unknown>=build();
    if(mode==='foreign')row={...row,app:{id:'project-b'}};
    if(mode==='old')row={...row,createdAt:'2001-01-01T00:00:00Z'};
    if(mode==='bad-date')row={...row,createdAt:'invalid'};
    if(mode==='platform')row={...row,platform:'NOT_ANDROID'};
    if(mode==='unsafe-url')row={...row,artifacts:{buildUrl:'javascript:alert(1)'}};
    if(url.pathname==='/graphql'){
      graphql++;const body=JSON.parse(String(init?.body));assert.equal(body.variables.appId,'project-a');assert.match(body.query,/app \{ id \}/);assert.doesNotMatch(body.query,/edges|node/);
      return Response.json({data:{app:{byId:{id:mode==='foreign-parent'?'project-b':'project-a',builds:[row]}}}});
    }
    assert.equal(url.pathname,'/v2/projects/project-a/builds');buildReads++;
    if(mode==='fallback'||mode==='foreign-parent')return Response.json({}, {status:404});
    if(mode==='pin'&&buildReads===1)row={...row,status:'IN_PROGRESS'};
    return Response.json({data:[row]});
  });
  for(mode of ['ok','fallback']){
    const rows=await listEasBuilds({userId:'owner',projectId:'project-a'});assert.equal(rows.length,1);assert.equal(rows[0]?.projectId,'project-a');
  }
  assert.equal(projectReads,0);assert.ok(graphql>0);
  mode='pin';buildReads=0;
  const pinned=await waitForEasBuildArtifact({userId:'owner',platform:'android',ignoreBuildIds:[],startedAfterMs:Date.now()-1000,intervalMs:1,timeoutMs:200});
  assert.equal(pinned.ok,true);assert.equal(projectReads,1);assert.ok(buildReads>=2);
  for(mode of ['foreign','foreign-parent','old','bad-date','platform','unsafe-url','ok']){
    const result=await waitForEasBuildArtifact({userId:'owner',projectId:'project-a',platform:'android',ignoreBuildIds:mode==='ok'?['new-build']:[],startedAfterMs:Date.now()-1000,intervalMs:1,timeoutMs:15});
    assert.equal(result.ok,false,mode);
  }
  const pipeline=await readFile(new URL('../../ai/pipeline.ts',import.meta.url),'utf8');
  assert.match(pipeline,/waitForEasBuildArtifact\(\{\s*userId: opts.userId,\s*projectId: eas.projectId/);
  assert.match(pipeline,/waitForEasBuildArtifact\(\{\s*userId: opts.userId,\s*projectId: easIos.projectId/);
});
