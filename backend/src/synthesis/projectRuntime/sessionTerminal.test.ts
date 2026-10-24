import assert from 'node:assert/strict';
import {test} from 'node:test';
import {FlyProjectRuntimeProvider} from './flyProvider.js';
import {ProjectRuntimeManager} from './manager.js';
import {InMemoryProjectRuntimeStore} from './store.js';
import type {ProjectRuntimeSession} from './types.js';

test('delayed actual provider restore cannot resurrect a concurrently destroyed session',async t=>{
  const now=new Date().toISOString();
  const session:ProjectRuntimeSession={schemaVersion:'1.0.0',sessionId:'session',userId:'owner',projectId:'project',providerId:'fly-project-runtime',runtimeClass:'interactive',status:'running',image:null,workspaceRevision:1,knownFiles:[],processes:[],ports:[],providerState:{machineId:'machine'},createdAt:now,updatedAt:now,expiresAt:null};
  const store=new InMemoryProjectRuntimeStore();await store.saveSession(session);
  const events=t.mock.method(store,'appendEvent');let release!:()=>void,started!:()=>void;
  const entered=new Promise<void>(resolve=>{started=resolve;});const held=new Promise<void>(resolve=>{release=resolve;});let requests=0;
  const provider=new FlyProjectRuntimeProvider({app:'synthetic',token:'synthetic',fetchImpl:async(_input,init)=>{
    requests++;if(init?.method==='GET'){started();await held;return Response.json({id:'machine',state:'started'});}
    assert.equal(init?.method,'DELETE');return new Response(null,{status:204});
  }});
  const manager=new ProjectRuntimeManager('owner',store,[provider]);
  const pending=manager.restore(session.sessionId);void pending.catch(()=>{});await entered;
  await manager.destroy(session.sessionId);const terminal=await store.loadSession('owner',session.sessionId);
  release();await assert.rejects(pending,{code:'RESOURCE_ACCESS_UNAVAILABLE'});
  assert.deepEqual(await store.loadSession('owner',session.sessionId),terminal);assert.equal(events.mock.callCount(),1);
  await assert.rejects(manager.restore(session.sessionId),/Destroyed runtime/);assert.equal(requests,2);
  await store.saveSession({...session,sessionId:'fresh',status:'stopped'});
  await store.saveSession({...session,sessionId:'fresh',status:'running'});
  assert.equal((await store.loadSession('owner','fresh'))?.status,'running');
});
