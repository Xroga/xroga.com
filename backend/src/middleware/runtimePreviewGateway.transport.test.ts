import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import dns from 'node:dns';
import { createServer, request, type IncomingHttpHeaders, type Server } from 'node:http';
import { once } from 'node:events';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import { runtimePreviewGateway, attachRuntimePreviewWebSocketGateway } from './runtimePreviewGateway.js';
import { livePreviewUrl } from '../synthesis/livePreview/signing.js';
import type { LivePreviewGrant } from '../synthesis/livePreview/types.js';

const listen = async (server: Server) => {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return (server.address() as {port: number}).port;
};
const closedWithin = (ws: WebSocket) => Promise.race([
  once(ws, 'close'),
  new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Revoked socket stayed open')), 8_000); timer.unref(); }),
]);

test('real local HTTP and WebSocket preview transports enforce scoped targets, header separation and lifetime revocation', async t => {
  const keys = ['NODE_ENV','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','XROGA_PREVIEW_SIGNING_SECRET'];
  const old = keys.map(k => process.env[k]);
  Object.assign(process.env, { NODE_ENV:'test', SUPABASE_URL:'http://127.0.0.1:55441', SUPABASE_SERVICE_ROLE_KEY:'synthetic-only', XROGA_PREVIEW_SIGNING_SECRET:'synthetic-signing-only' });
  t.after(() => keys.forEach((k,i) => { if (old[i] === undefined) delete process.env[k]; else process.env[k] = old[i]; }));
  const owner = randomUUID(), project = randomUUID(), session = randomUUID(), now = new Date().toISOString();
  let hits = 0, headers: IncomingHttpHeaders = {}, wsHeaders: IncomingHttpHeaders = {}, received: string[] = [];
  const upstream = createServer((req, res) => {
    hits++; headers = req.headers;
    if (req.url === '/redirect') { res.writeHead(302, {location:'http://169.254.169.254/latest/meta-data'}); res.end(); return; }
    if (req.url === '/relative') { res.writeHead(302, {location:'/local'}); res.end(); return; }
    if (req.url === '/stream') {
      res.write('first'); const timer=setInterval(() => res.write('chunk'),20);
      res.once('close', () => clearInterval(timer)); return;
    }
    res.end('owned-preview');
  });
  const wss = new WebSocketServer({server: upstream});
  wss.on('connection', (ws, req) => {
    hits++; wsHeaders = req.headers;
    ws.on('message', (data, binary) => { received.push(data.toString()); ws.send(data, {binary}); });
  });
  const port = await listen(upstream);
  const grant: LivePreviewGrant = {previewId:randomUUID(),userId:owner,projectId:project,sessionId:session,runId:randomUUID(),kind:'browser',port,expiresAt:new Date(Date.now()+60_000).toISOString(),createdAt:now,revokedAt:null};
  const original = {preview_id:grant.previewId,user_id:owner,project_id:project,session_id:session,run_id:grant.runId,preview_kind:grant.kind,port,expires_at:grant.expiresAt,created_at:now,revoked_at:null};
  const state = {schemaVersion:'1.0.0',userId:owner,projectId:project,sessionId:session,status:'running',runtimeClass:'interactive',ports:[{port,protocol:'http',status:'listening'}],expiresAt:null,providerState:{machineId:'abc123',app:'xroga-isolated-runtime'}};
  let grantRow: Record<string, unknown> = {...original};
  let row: Record<string, unknown> = {user_id:owner,project_id:project,session_id:session,state};
  t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(String(input)); assert.equal(url.origin, process.env.SUPABASE_URL);
    if (url.pathname === '/rest/v1/project_preview_grants') return Response.json(grantRow);
    assert.equal(url.pathname, '/rest/v1/project_runtime_sessions'); return Response.json(row);
  });
  // Only the independently resolved, fixed runtime host is mapped to our real
  // loopback server. No production DNS, Fly machine or public provider is used.
  const lookup = dns.lookup;
  t.mock.method(dns, 'lookup', ((hostname: string, options: unknown, callback: Function) => {
    if (hostname === 'abc123.vm.xroga-isolated-runtime.internal') {
      queueMicrotask(() => (options as {all?:boolean})?.all ? callback(null,[{address:'127.0.0.1',family:4}]) : callback(null,'127.0.0.1',4));
      return;
    }
    assert.equal(hostname, '127.0.0.1', 'No arbitrary destination lookup');
    return (lookup as Function)(hostname, options, callback);
  }) as typeof dns.lookup);
  const app = express(); app.use(runtimePreviewGateway);
  const gateway = createServer(app); attachRuntimePreviewWebSocketGateway(gateway);
  const gatewayPort = await listen(gateway), host = new URL(livePreviewUrl(grant)).hostname;
  const clients: WebSocket[] = [];
  t.after(async () => {
    clients.forEach(ws => ws.terminate()); wss.clients.forEach(ws => ws.terminate()); wss.close();
    upstream.closeAllConnections(); gateway.closeAllConnections();
    await Promise.all([new Promise<void>(r => upstream.close(() => r())), new Promise<void>(r => gateway.close(() => r()))]);
  });
  const http = (path = '/') => new Promise<{status:number;body:string;location?:string}>((resolve,reject) => {
    const req = request({hostname:'127.0.0.1',port:gatewayPort,path,headers:{host,authorization:'Bearer PLATFORM_CANARY',cookie:'sb-project-auth-token=COOKIE_CANARY',apikey:'KEY_CANARY','x-unrelated-user':'PRIVATE_CANARY','x-forwarded-host':'evil.example',accept:'text/html'}}, res => {
      let body=''; res.on('data', chunk => body += chunk); res.on('end', () => resolve({status:res.statusCode!,body,location:res.headers.location}));
    }); req.on('error', reject); req.end();
  });
  assert.equal((await http()).body, 'owned-preview');
  for (const name of ['authorization','cookie','apikey','x-unrelated-user']) assert.equal(headers[name], undefined);
  assert.equal(headers.accept, 'text/html'); assert.equal(headers['x-forwarded-host'], host);
  const beforeRedirect = hits;
  assert.equal((await http('/redirect')).status, 502); assert.equal(hits, beforeRedirect+1, 'Gateway never follows a target redirect');
  assert.equal((await http('/relative')).location,'/local');
  for(const path of [`@127.0.0.1:${port}/escape`,`http://127.0.0.1:${port}/escape`,`//127.0.0.1:${port}/escape`]) {
    await new Promise<void>((resolve,reject)=>{
      const req=request({hostname:'127.0.0.1',port:gatewayPort,path,headers:{host,connection:'Upgrade',upgrade:'websocket','sec-websocket-version':'13','sec-websocket-key':Buffer.alloc(16).toString('base64')}},res=>{
        res.resume();try{assert.equal(res.statusCode,400);resolve();}catch(error){reject(error);}
      });
      req.once('upgrade',(_res,socket)=>{socket.destroy();reject(new Error('Malformed preview request target upgraded'));});
      req.once('error',reject);req.end();
    });
  }
  for (const change of [{revoked_at:now},{expires_at:new Date(Date.now()-1).toISOString()},{project_id:randomUUID()},{port:port+1}]) {
    grantRow={...original,...change}; const before=hits; assert.equal((await http()).status,410); assert.equal(hits,before);
  }
  grantRow={...original}; row={user_id:randomUUID(),project_id:project,session_id:session,state};
  assert.equal((await http()).status,410); row={user_id:owner,project_id:project,session_id:session,state};
  for (const change of [{revoked_at:now},{expires_at:new Date(Date.now()-1).toISOString()},{session_id:randomUUID()},{port:port+1}]) {
    grantRow={...original,...change}; const before=hits;
    await new Promise<void>((resolve,reject) => {
      const denied=new WebSocket(`ws://127.0.0.1:${gatewayPort}/hmr`,{headers:{host}}); clients.push(denied);
      denied.on('error',()=>{});
      denied.once('open',()=>reject(new Error('Invalid grant upgraded')));
      denied.once('unexpected-response',(_req,res)=>{assert.equal(res.statusCode,410);res.resume();denied.terminate();resolve();});
    });
    assert.equal(hits,before,'Invalid WebSocket grants never connect upstream');
  }
  grantRow={...original};
  const ws = new WebSocket(`ws://127.0.0.1:${gatewayPort}/hmr`, {headers:{host,authorization:'Bearer PLATFORM_CANARY',cookie:'COOKIE_CANARY','x-unrelated-user':'PRIVATE_CANARY'}}); clients.push(ws);
  await once(ws,'open');
  const echo=once(ws,'message'); ws.send('authorized-message'); assert.equal((await echo)[0].toString(),'authorized-message');
  for (const name of ['authorization','cookie','x-unrelated-user']) assert.equal(wsHeaders[name],undefined);
  assert.deepEqual(received,['authorized-message']);
  const binaryEcho=once(ws,'message');ws.send(Buffer.from([0,1,255]));const [bytes,binary]=await binaryEcho;
  assert.deepEqual(bytes,Buffer.from([0,1,255]));assert.equal(binary,true);
  const delivered=received.slice();
  grantRow={...original,revoked_at:now}; const closed=closedWithin(ws); ws.send('REVOKED_CANARY'); await closed;
  assert.deepEqual(received,delivered,'Revoked message never reaches real upstream');
  grantRow={...original};
  const downstream=new WebSocket(`ws://127.0.0.1:${gatewayPort}/hmr`,{headers:{host}});clients.push(downstream);await once(downstream,'open');
  const ready=once(downstream,'message');downstream.send('before-downstream-revocation');await ready;
  const leaked: string[]=[];downstream.on('message',data=>leaked.push(data.toString()));
  grantRow={...original,revoked_at:now};const downstreamClosed=closedWithin(downstream);
  wss.clients.forEach(client=>{if(client.readyState===WebSocket.OPEN)client.send('UPSTREAM_REVOKED_CANARY');});
  await downstreamClosed;assert.deepEqual(leaked,[],'Revoked upstream data is withheld from the client');
  grantRow={...original};
  const idle=new WebSocket(`ws://127.0.0.1:${gatewayPort}/hmr`,{headers:{host}}); clients.push(idle); await once(idle,'open');
  const idleEcho=once(idle,'message'); idle.send('before-idle'); await idleEcho;
  row={user_id:owner,project_id:project,session_id:session,state:{...state,status:'stopped'}};
  await closedWithin(idle);
  row={user_id:owner,project_id:project,session_id:session,state};
  await new Promise<void>((resolve,reject) => {
    const req=request({hostname:'127.0.0.1',port:gatewayPort,path:'/stream',headers:{host}},res => {
      res.once('data', () => { grantRow={...original,revoked_at:now}; });
      res.once('close', resolve); res.on('error', () => {});
    }); req.on('error',reject); req.setTimeout(8_000, () => {req.destroy(); reject(new Error('Revoked HTTP stream stayed open'));}); req.end();
  });
  grantRow={...original};
  const bounded=new WebSocket(`ws://127.0.0.1:${gatewayPort}/hmr`,{headers:{host}});clients.push(bounded);await once(bounded,'open');
  const boundedReady=once(bounded,'message');bounded.send('before-large-frame');await boundedReady;
  const beforeLargeFrame=received.length,oversizedClosed=closedWithin(bounded);
  bounded.send(Buffer.alloc(1024*1024+1));const close=await oversizedClosed as [number,Buffer];
  assert.equal(close[0],1009);assert.equal(received.length,beforeLargeFrame,'Oversized data never reaches upstream');
});
