import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {canonicalDispatchHandler} from './googleDispatchHandler.js';
import type {GoogleDispatchConfiguration} from './googleDispatch.js';
const project='project-c40d4821-e647-4fa2-92d',id='11111111-1111-4111-8111-111111111111';
const c:GoogleDispatchConfiguration={project,region:'us-east4',queue:'xroga-canonical-queue',job:'xroga-canonical-worker',
  dispatcherUrl:'https://xroga-dispatcher-fixture.us-east4.run.app/internal/canonical-dispatch',
  dispatchAccount:`xroga-task-invoker@${project}.iam.gserviceaccount.com`,
  runtimeAccount:`xroga-api-runtime@${project}.iam.gserviceaccount.com`,
  image:`us-east4-docker.pkg.dev/${project}/cloud-run-source-deploy/xroga-api-migration@sha256:${'a'.repeat(64)}`,sourceSha:'b'.repeat(40),kmsKeyName:`projects/${project}/locations/us-central1/keyRings/synthetic/cryptoKeys/custody`};
test('HTTP dispatcher authenticates before DB reads, keeps an uncertain launch fenced and never accepts an actor payload',async()=>{
  let reserves=0,launches=0,recorded=0,busy=false,unknown=false;
  const token='22222222-2222-4222-8222-222222222222';
  const app=express();app.use(express.json({limit:'1kb'}));app.post('/internal/canonical-dispatch',canonicalDispatchHandler(c,
    {reserve:async()=>{reserves++;return busy?{state:'busy'}:{state:'reserved',token};},recordLaunch:async()=>{recorded++;}},
    {launch:async()=>{launches++;if(unknown)throw new Error('PRIVATE_GOOGLE_PROVIDER_CANARY');return{operationName:`projects/${project}/locations/us-east4/operations/fixture`};}},
    async(header,config)=>{assert.equal(config.serviceAccountEmail,c.dispatchAccount);assert.equal(config.audience,new URL(c.dispatcherUrl).origin);return header==='Bearer allowed';}));
  const server=createServer(app);server.listen(0,'127.0.0.1');await once(server,'listening');const port=(server.address() as {port:number}).port;
  const post=(body:unknown,auth='Bearer allowed')=>fetch(`http://127.0.0.1:${port}/internal/canonical-dispatch`,{method:'POST',headers:{authorization:auth,'content-type':'application/json'},body:JSON.stringify(body)});
  try{
    assert.equal((await post({deliveryId:id},'Bearer forged')).status,401);assert.equal(reserves,0);
    assert.equal((await post({deliveryId:id,userId:'raw-owner'})).status,400);assert.equal(reserves,0);
    assert.equal((await post({deliveryId:id})).status,204);assert.equal(launches,1);assert.equal(recorded,1);
    unknown=true;const failed=await post({deliveryId:id});assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes('CANARY'));
    busy=true;assert.equal((await post({deliveryId:id})).status,429);assert.equal(launches,2);assert.equal(recorded,1);
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
