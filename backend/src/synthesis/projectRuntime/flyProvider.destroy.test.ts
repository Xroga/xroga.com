import assert from 'node:assert/strict';
import {test} from 'node:test';
import {FlyProjectRuntimeProvider} from './flyProvider.js';
import {ProjectRuntimeManager} from './manager.js';
import {InMemoryProjectRuntimeStore} from './store.js';
import type {ProjectRuntimeSession} from './types.js';

for (const outcome of [200,204,404,202,401,403,429,500,'network'] as const) {
  test(`runtime destruction ${outcome} requires confirmation before durable state or event`,async t=>{
    const now=new Date().toISOString();
    const session:ProjectRuntimeSession={schemaVersion:'1.0.0',sessionId:'synthetic-session',userId:'owner',projectId:'project',
      providerId:'fly-project-runtime',runtimeClass:'interactive',status:'running',image:null,workspaceRevision:1,
      knownFiles:[],processes:[],ports:[],providerState:{machineId:'synthetic-machine'},createdAt:now,updatedAt:now,expiresAt:null};
    const store=new InMemoryProjectRuntimeStore();await store.saveSession(session);
    const saves=t.mock.method(store,'saveSession');const events=t.mock.method(store,'appendEvent');let requests=0;
    const provider=new FlyProjectRuntimeProvider({app:'synthetic-app',token:'SYNTHETIC_PRIVATE_TOKEN',apiHost:'http://127.0.0.1:49231',fetchImpl:async(input,init)=>{
      requests++;assert.equal(String(input),'http://127.0.0.1:49231/v1/apps/synthetic-app/machines/synthetic-machine?force=true');assert.equal(init?.method,'DELETE');
      if(outcome==='network')throw new Error('SYNTHETIC_PRIVATE_TOKEN network failure');
      return new Response(outcome===204?null:'SYNTHETIC_PRIVATE_TOKEN response body',{status:outcome});
    }});
    const manager=new ProjectRuntimeManager('owner',store,[provider]);
    if(outcome===200||outcome===204||outcome===404){
      await manager.destroy(session.sessionId);
      assert.equal((await store.loadSession('owner',session.sessionId))?.status,'destroyed');
      assert.equal(saves.mock.callCount(),1);assert.equal(events.mock.callCount(),1);
      assert.equal(events.mock.calls[0].arguments[0].eventType,'runtime.destroyed');
    }else{
      await assert.rejects(manager.destroy(session.sessionId),{message:'Runtime destruction could not be confirmed.'});
      assert.deepEqual(await store.loadSession('owner',session.sessionId),session);
      assert.equal(saves.mock.callCount(),0);assert.equal(events.mock.callCount(),0);
    }
    assert.equal(requests,1);
  });
}
