import assert from 'node:assert/strict';
import {test} from 'node:test';
import {FlyProjectRuntimeProvider} from './flyProvider.js';
import {ProjectRuntimeManager} from './manager.js';
import {InMemoryProjectRuntimeStore} from './store.js';
import type {ProjectRuntimeSession} from './types.js';

for(const [name,body,valid] of [
  ['matching',{id:'machine',state:'started'},true],['missing',{},false],
  ['wrong machine',{id:'other',state:'started'},false],['missing state',{id:'machine'},false],
  ['stopped',{id:'machine',state:'stopped'},false],['null',null,false],['array',[],false],['invalid JSON','invalid',false],
] as const)test(`Fly restore ${name} binds exact provider receipt before session persistence`,async t=>{
  const now=new Date().toISOString(),session:ProjectRuntimeSession={schemaVersion:'1.0.0',sessionId:'session',userId:'owner',projectId:'project',providerId:'fly-project-runtime',runtimeClass:'interactive',status:'stopped',image:null,workspaceRevision:1,knownFiles:[],processes:[],ports:[],providerState:{machineId:'machine',app:'synthetic'},createdAt:now,updatedAt:now,expiresAt:null};
  const store=new InMemoryProjectRuntimeStore();await store.saveSession(session);const saves=t.mock.method(store,'saveSession');
  const provider=new FlyProjectRuntimeProvider({app:'synthetic',token:'synthetic',apiHost:'http://127.0.0.1:49233',fetchImpl:async(input,init)=>{
    assert.equal(String(input),'http://127.0.0.1:49233/v1/apps/synthetic/machines/machine');assert.equal(init?.method,'GET');
    return typeof body==='string'?new Response(body):Response.json(body);
  }});
  const manager=new ProjectRuntimeManager('owner',store,[provider]);
  if(valid){assert.equal((await manager.restore('session')).status,'running');assert.equal(saves.mock.callCount(),1);}
  else{await assert.rejects(manager.restore('session'),{message:'Runtime restore could not be confirmed.'});assert.equal(saves.mock.callCount(),0);assert.deepEqual(await store.loadSession('owner','session'),session);}
});

test('Fly explicit app mismatch is denied before network while legacy missing app uses configured app',async()=>{
  let calls=0;const provider=new FlyProjectRuntimeProvider({app:'synthetic',token:'synthetic',fetchImpl:async()=>{calls++;return Response.json({id:'machine',state:'started'});}});
  const now=new Date().toISOString(),session:ProjectRuntimeSession={schemaVersion:'1.0.0',sessionId:'session',userId:'owner',projectId:'project',providerId:'fly-project-runtime',runtimeClass:'interactive',status:'running',image:null,workspaceRevision:1,knownFiles:[],processes:[],ports:[],providerState:{machineId:'machine',app:'other'},createdAt:now,updatedAt:now,expiresAt:null};
  await assert.rejects(provider.restore(session),/provider identity/);await assert.rejects(provider.destroy(session),/provider identity/);assert.equal(calls,0);
  assert.equal((await provider.restore({...session,providerState:{machineId:'machine'}})).status,'running');assert.equal(calls,1);
});
