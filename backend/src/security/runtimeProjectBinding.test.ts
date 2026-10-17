import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {loadProjectRuntimeSession} from './runtimeProjectBinding.js';
import {startOrRefreshLivePreview} from '../synthesis/livePreview/coordinator.js';
import {SupabaseProjectRuntimeStore} from '../synthesis/projectRuntime/store.js';
import {ProjectRuntimeManager} from '../synthesis/projectRuntime/manager.js';
import type {ProjectRuntimeSession} from '../synthesis/projectRuntime/types.js';
import type {SoftwareProject} from '../synthesis/softwareProject.js';
import express from 'express';
import runtimeRouter from '../routes/projectRuntime.js';
import type {AuthRequest} from '../middleware/auth.js';
import {createTenantContext} from './tenantContext.js';

test('project binding rejects mismatched runtime identity and preserves owned/missing reads',async()=>{
  const session={userId:'owner',projectId:'project',sessionId:'session'} as ProjectRuntimeSession;
  const store={loadSession:async()=>session};
  assert.equal(await loadProjectRuntimeSession(store,'owner','project','session'),session);
  for(const args of [['other','project','session'],['owner','other','session'],['owner','project','other']])
    await assert.rejects(loadProjectRuntimeSession(store,...args as [string,string,string]),{status:404});
  assert.equal(await loadProjectRuntimeSession({loadSession:async()=>null},'owner','project','session'),null);
});

test('runtime HTTP read logs stop and restart deny cross-project bindings before provider or revision writes',async t=>{
  const owner=randomUUID(),projectId=randomUUID(),sessionId=randomUUID();
  const project={projectId,runId:randomUUID(),runtime:{sessionId,runtimeClass:'interactive',status:'running'}};
  t.mock.method(SupabaseProjectRuntimeStore.prototype,'loadLatestRevision',async()=>({project}));
  t.mock.method(SupabaseProjectRuntimeStore.prototype,'loadSession',async()=>({userId:owner,projectId:'other-project',sessionId}));
  let calls=0;
  t.mock.method(SupabaseProjectRuntimeStore.prototype,'saveRevision',async()=>{calls++;throw new Error('No persistence');});
  for(const method of ['restore','destroy','create','logs'] as const)t.mock.method(ProjectRuntimeManager.prototype,method,async()=>{calls++;throw new Error('No provider');});
  const app=express();app.use((req,_res,next)=>{(req as AuthRequest).tenantContext=createTenantContext({userId:owner,via:'remote_getuser'});next();});app.use('/runtime',runtimeRouter);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  for(const [suffix,method] of [['','GET'],['/logs','GET'],['/stop','POST'],['/restart','POST']]){
    const response=await fetch(`http://127.0.0.1:${address.port}/runtime/${projectId}${suffix}`,{method});assert.equal(response.status,404);assert.equal((await response.json() as {code:string}).code,'RESOURCE_NOT_FOUND');
  }
  assert.equal(calls,0);
});

test('live preview never restores, destroys or creates a provider for a cross-project saved binding',async t=>{
  const owner=randomUUID(),projectId=randomUUID(),runId=randomUUID(),sessionId=randomUUID();
  const project={projectId,runId,contract:{projectId,runId,semanticGoal:{goal:'Synthetic preview'}},
    recipe:{previewStrategy:'browser'},workspace:{files:[{path:'index.html',content:'<html>fixture</html>'}]},
    runtime:{sessionId,runtimeClass:'interactive',status:'running'}} as unknown as SoftwareProject;
  t.mock.method(SupabaseProjectRuntimeStore.prototype,'loadLatestRevision',async()=>({project}));
  t.mock.method(SupabaseProjectRuntimeStore.prototype,'loadSession',async()=>({userId:owner,projectId:'different-project',sessionId}));
  let calls=0;
  for(const method of ['restore','destroy','create'] as const)t.mock.method(ProjectRuntimeManager.prototype,method,async()=>{calls++;throw new Error('Provider must not be invoked');});
  const result=await startOrRefreshLivePreview({userId:owner,project,runId});
  assert.equal(calls,0);assert.equal(result.preview.status,'failed');assert.equal(result.preview.url,null);
});
