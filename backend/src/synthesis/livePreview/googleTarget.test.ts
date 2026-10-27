import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {executionBinding,type GceExecutionHandle} from '../../sandbox/google/gceMachineControl.js';
import type {ProjectRuntimeSession} from '../projectRuntime/types.js';
import type {LivePreviewGrant} from './types.js';
import {googlePreviewTarget} from './googleTarget.js';

function fixture(){
  const now=Date.now();const sessionId=randomUUID();const image='node@sha256:'+'a'.repeat(64);
  const grant={userId:'owner',projectId:'project',sessionId,port:3000,expiresAt:new Date(now+60000).toISOString(),revokedAt:null} as LivePreviewGrant;
  const handle={...executionBinding({runtimeId:sessionId,ownerReference:'owner',scopeReference:'project',ttlSeconds:60,memoryMb:128,diskMb:64,maxProcesses:16,cpus:1}),
    name:'xroga-exec-'+sessionId.replaceAll('-',''),instanceId:'123',expiresAtEpoch:Math.floor(now/1000)+60};
  const configuration={project:'synthetic-project',zone:'us-central1-a',subnet:'synthetic',imageName:'synthetic',imageId:'12345',serviceAccount:'synthetic',admittedImages:[image]};
  const session:ProjectRuntimeSession={schemaVersion:'1.0.0',workspaceRevision:1,knownFiles:[],processes:[],createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),
    userId:'owner',projectId:'project',sessionId,providerId:'google-gce',status:'running',runtimeClass:'interactive',image,
    expiresAt:new Date(now+60000).toISOString(),ports:[{port:3000,protocol:'http',status:'listening',processId:'process'}],
    providerState:{gce:handle,project:configuration.project,zone:configuration.zone,baseImageId:configuration.imageId,privateIp:'169.254.169.254'}};
  let calls=0,identityChecks=0;let address='10.90.0.2';let denied=false;let time=now;
  const control={configuration,async resolve(value:GceExecutionHandle){calls++;assert.deepEqual(value,handle);if(denied)throw new Error('PRIVATE_PROVIDER_CANARY');return {privateIp:address,sshHostKey:'synthetic'};}};
  const identity=async()=>{identityChecks++;};
  return {grant,session,control,identity,clock:()=>time,get calls(){return calls;},get identityChecks(){return identityChecks;},
    address(value:string){address=value;},deny(){denied=true;},expire(){time=now+60001;}};
}

test('Google Preview uses only the authenticated physical address and declared port',async()=>{
  const f=fixture();assert.deepEqual(await googlePreviewTarget(f.grant,f.session,f.control,f.identity,f.clock),{host:'10.90.0.2',port:3000});
  assert.equal(f.calls,1);assert.equal(f.identityChecks,1);
});

test('foreign, expired, revoked and substituted sessions deny before control-plane lookup',async()=>{
  for(const mode of ['owner','project','provider','port','revoked','expired','handle','image']){
    const f=fixture();
    if(mode==='owner')Object.assign(f.session,{userId:'foreign'});
    if(mode==='project')Object.assign(f.session,{projectId:'foreign'});
    if(mode==='provider')Object.assign(f.session,{providerId:'fly'});
    if(mode==='port')Object.assign(f.session,{ports:[]});
    if(mode==='revoked')Object.assign(f.grant,{revokedAt:new Date().toISOString()});
    if(mode==='expired')f.expire();
    if(mode==='handle')(f.session.providerState.gce as GceExecutionHandle).ownerBinding='foreign';
    if(mode==='image')Object.assign(f.session,{image:'node:22'});
    assert.equal(await googlePreviewTarget(f.grant,f.session,f.control,f.identity,f.clock),null,mode);assert.equal(f.calls,0,mode);
  }
});

test('metadata/public address, physical denial, identity denial and expiry during admission cannot route',async()=>{
  for(const mode of ['metadata','public','physical','identity','expiry']){
    const f=fixture();
    if(mode==='metadata')f.address('169.254.169.254');if(mode==='public')f.address('8.8.8.8');if(mode==='physical')f.deny();
    const identity=mode==='identity'?async()=>{throw new Error('PRIVATE_IDENTITY_CANARY');}:mode==='expiry'?async()=>f.expire():f.identity;
    assert.equal(await googlePreviewTarget(f.grant,f.session,f.control,identity,f.clock),null,mode);
  }
});
