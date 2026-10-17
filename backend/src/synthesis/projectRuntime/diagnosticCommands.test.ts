import assert from 'node:assert/strict';
import {test} from 'node:test';
import {FlyProjectRuntimeProvider} from './flyProvider.js';
import {ProjectRuntimeManager} from './manager.js';
import {ProjectProcessManager} from './processManager.js';
import {InMemoryProjectRuntimeStore} from './store.js';
import type {ProjectRuntimeSession,ProviderRuntimeCommand,ProviderRuntimeProcessStartInput} from './types.js';

test('runtime diagnostic events redact known and generic secrets without changing execution or restart inputs',async t=>{
  const prior=process.env.USER_SECRETS_ENCRYPTION_KEY;process.env.USER_SECRETS_ENCRYPTION_KEY='synthetic-local-key';
  try{
    const now=new Date().toISOString(),known='KNOWN_PRIVATE_COMMAND_CANARY',generic='GENERIC_PRIVATE_COMMAND_CANARY';
    const session:ProjectRuntimeSession={schemaVersion:'1.0.0',sessionId:'session',userId:'owner',projectId:'project',providerId:'fly-project-runtime',runtimeClass:'interactive',status:'running',image:null,workspaceRevision:1,knownFiles:[],processes:[],ports:[],providerState:{machineId:'synthetic'},createdAt:now,updatedAt:now,expiresAt:null};
    const store=new InMemoryProjectRuntimeStore();await store.saveSession(session);const events=t.mock.method(store,'appendEvent');
    const provider=new FlyProjectRuntimeProvider({app:'synthetic',token:'synthetic',fetchImpl:async()=>{throw new Error('Unexpected network');}});
    const executions:unknown[]=[];
    t.mock.method(provider,'exec',async(_session:ProjectRuntimeSession,input:ProviderRuntimeCommand)=>{executions.push(structuredClone(input));return{exitCode:0,stdout:'ok',stderr:'',durationMs:1};});
    const starts:unknown[]=[];
    t.mock.method(provider,'startProcess',async(_session:ProjectRuntimeSession,input:ProviderRuntimeProcessStartInput)=>{starts.push(structuredClone(input));return{pid:123,logPath:'/synthetic.log'};});
    t.mock.method(provider,'stopProcess',async()=>{});
    const manager=new ProjectRuntimeManager('owner',store,[provider]);
    await manager.secretManager().put({projectId:'project',name:'API_TOKEN',scope:'preview',value:known});
    const input={command:`command-${known} token=${generic}`,args:[known,`password=${generic}`,'safe'],cwd:`/work/${known}`,secretScopes:['preview'] as const};
    await manager.exec('session',input);const process=await manager.startProcess('session',input);
    await new ProjectProcessManager(manager).restart('session',process);
    assert.equal(executions.length,1);assert.equal(starts.length,2);
    for(const actual of [...executions,...starts] as typeof input[]){assert.equal(actual.command,input.command);assert.deepEqual(actual.args,input.args);assert.equal(actual.cwd,input.cwd);}
    assert.equal((await store.loadSession('owner','session'))?.processes[0].command,input.command);
    const persisted=await Promise.all(events.mock.calls.map(call=>call.result));
    assert.equal(persisted.filter(event=>event?.eventType==='runtime.command').length,1);
    assert.equal(persisted.filter(event=>event?.eventType==='runtime.process_started').length,2);
    assert.ok(!JSON.stringify(persisted).includes(known));assert.ok(!JSON.stringify(persisted).includes(generic));
  }finally{if(prior===undefined)delete process.env.USER_SECRETS_ENCRYPTION_KEY;else process.env.USER_SECRETS_ENCRYPTION_KEY=prior;}
});
