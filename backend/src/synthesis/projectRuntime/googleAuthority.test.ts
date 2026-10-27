import assert from 'node:assert/strict';
import test from 'node:test';
import {createTenantContext, type TenantContext} from '../../security/tenantContext.js';
import {googleRuntimeAdmission, runtimeAuthorityIdentity} from './googleAuthority.js';
import {TenantAccessError} from '../../security/tenantErrors.js';
import {projectWorkspaceFingerprint, type ProjectRevisionRecord} from './store.js';
import type {ProjectRuntimeSession} from './types.js';

// Synthetic owner-store fixtures exercise admission, not a live database caller.
function fixture() {
  const userId='11111111-1111-4111-8111-111111111111';
  const authority=createTenantContext({userId,via:'local_jwt'});
  const project={projectId:'project',runId:'run',contract:{projectId:'project',runId:'run'},workspace:{revision:1,fileCount:1,updatedAt:new Date().toISOString(),files:[{path:'index.ts',content:'owned-source'}]}};
  let revision={userId,projectId:'project',runId:'run',project,workspaceFingerprint:projectWorkspaceFingerprint(project)} as ProjectRevisionRecord;
  const session={userId,projectId:'project',sessionId:'session',providerId:'google-gce',status:'running',
    providerState:{gce:{name:'worker',instanceId:'1',runtimeId:'session',ownerBinding:'owner',projectBinding:'project',expiresAtEpoch:123}}} as unknown as ProjectRuntimeSession;
  let current=structuredClone(session);let checks=0;let denied=false;
  const admit=googleRuntimeAdmission(authority,{async loadLatestRevision(){return revision;},async loadSession(){return current;}},
    {async ownedRun(context,runId){assert.equal(context,authority);assert.equal(runId,'run');checks++;if(denied)throw new Error('PRIVATE_OWNER_STORE_CANARY');}});
  return {authority,session,project,admit,userId,get checks(){return checks;},deny(){denied=true;},
    setRevision(value:ProjectRevisionRecord){revision=value;},get revision(){return revision;},setSession(value:ProjectRuntimeSession){current=value;}};
}

test('runtime authority accepts only the original issued object',()=>{
  const f=fixture();assert.equal(runtimeAuthorityIdentity(f.authority).userId,f.userId);
  for(const value of [f.userId,structuredClone(f.authority),{userId:f.userId,generation:1},null]) {
    assert.throws(()=>runtimeAuthorityIdentity(value as TenantContext));
  }
});

test('canonical project source and current durable session are checked on every operation',async()=>{
  const f=fixture();await f.admit({userId:f.userId,projectId:'project',action:'create',sourceFiles:f.project.workspace.files});
  await f.admit({userId:f.userId,projectId:'project',action:'exec',session:f.session});assert.equal(f.checks,2);
  f.deny();await assert.rejects(f.admit({userId:f.userId,projectId:'project',action:'exec',session:f.session}),
    error=>error instanceof TenantAccessError&&error.code==='RESOURCE_ACCESS_UNAVAILABLE'&&!error.message.includes('PRIVATE_'));
});

test('foreign project, owner, stale fingerprint and substituted source cannot dispatch',async()=>{
  for(const mutate of [
    (f:ReturnType<typeof fixture>)=>f.setRevision({...f.revision,userId:'foreign'}),
    (f:ReturnType<typeof fixture>)=>f.setRevision({...f.revision,projectId:'foreign'}),
    (f:ReturnType<typeof fixture>)=>f.setRevision({...f.revision,workspaceFingerprint:'stale'}),
    (f:ReturnType<typeof fixture>)=>f.setRevision({...f.revision,runId:'foreign'}),
  ]) {
    const f=fixture();mutate(f);await assert.rejects(f.admit({userId:f.userId,projectId:'project',action:'create'}));assert.equal(f.checks,0);
  }
  const f=fixture();await assert.rejects(f.admit({userId:f.userId,projectId:'project',action:'create',sourceFiles:[{path:'index.ts',content:'unowned'}]}));
});

test('persisted handle revocation and failed sessions deny execution',async()=>{
  for(const status of ['failed','destroyed']) {
    const f=fixture();f.setSession({...f.session,status:status as ProjectRuntimeSession['status']});
    await assert.rejects(f.admit({userId:f.userId,projectId:'project',action:'exec',session:f.session}));
    await f.admit({userId:f.userId,projectId:'project',action:'destroy',session:f.session});
  }
  const f=fixture();const changed=structuredClone(f.session);
  (changed.providerState.gce as Record<string,unknown>).instanceId='other';f.setSession(changed);
  await assert.rejects(f.admit({userId:f.userId,projectId:'project',action:'exec',session:f.session}));
});

test('patch writes must match canonical content and deletion cannot remove a canonical file',async()=>{
  const f=fixture();
  await f.admit({userId:f.userId,projectId:'project',action:'write',session:f.session,sourceFiles:f.project.workspace.files});
  await assert.rejects(f.admit({userId:f.userId,projectId:'project',action:'write',session:f.session,sourceFiles:[{path:'index.ts',content:'unowned'}]}));
  await assert.rejects(f.admit({userId:f.userId,projectId:'project',action:'write',session:f.session,deletePaths:['index.ts']}));
  await f.admit({userId:f.userId,projectId:'project',action:'write',session:f.session,deletePaths:['obsolete.ts']});
});
