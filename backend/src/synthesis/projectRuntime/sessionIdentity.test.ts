import assert from 'node:assert/strict';
import {test} from 'node:test';
import {InMemoryProjectRuntimeStore} from './store.js';
import type {ProjectRuntimeSession} from './types.js';
test('runtime in-memory writer preserves immutable project provider and class',async()=>{
  const now=new Date().toISOString(),session:ProjectRuntimeSession={schemaVersion:'1.0.0',sessionId:'session',userId:'owner',projectId:'project',providerId:'fixture',runtimeClass:'interactive',status:'running',image:null,workspaceRevision:1,knownFiles:[],processes:[],ports:[],providerState:{},createdAt:now,updatedAt:now,expiresAt:null};
  const store=new InMemoryProjectRuntimeStore();await store.saveSession(session);
  for(const patch of [{projectId:'other'},{providerId:'other'},{runtimeClass:'verification' as const}])await assert.rejects(store.saveSession({...session,...patch}),{code:'RESOURCE_ACCESS_UNAVAILABLE'});
  assert.deepEqual(await store.loadSession('owner','session'),session);
  await store.saveSession({...session,workspaceRevision:2});assert.equal((await store.loadSession('owner','session'))?.workspaceRevision,2);
});
