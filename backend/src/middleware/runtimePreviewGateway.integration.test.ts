import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import {createServer,request,type Server} from 'node:http';
import {once} from 'node:events';
import {WebSocket,WebSocketServer} from 'ws';
import {createRuntimePreviewGateway,attachRuntimePreviewWebSocketGateway,type PreviewTarget} from './runtimePreviewGateway.js';

const host='11111111111141118111111111111111.abcdef0123456789abcdef01.preview.xroga.com';
async function listen(server:Server){server.listen(0,'127.0.0.1');await once(server,'listening');return (server.address() as {port:number}).port;}
function read(port:number,path='/'){
  return new Promise<{status:number;body:string;location?:string;headers:import('node:http').IncomingHttpHeaders}>((resolve,reject)=>{
    const req=request({hostname:'127.0.0.1',port,path,headers:{host}},res=>{
      let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode!,body,location:res.headers.location,headers:res.headers}));
    });req.on('error',reject);req.end();
  });
}
async function close(server:Server){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
async function fixture(admissionDelayMs=0){
  let upstreamHits=0,allowed=true,expiry=Date.now()+60000,authorityReads=0,throws=false;
  const upstream=createServer((req,res)=>{upstreamHits++;if(req.url==='/redirect'){res.writeHead(302,{location:`http://127.0.0.1:${upstreamPort}/asset?q=1`});res.end();}
    else if(req.url==='/cookies'){res.setHeader('set-cookie',['preview-session=synthetic; Domain=.xroga.com; Path=/; HttpOnly; Secure; SameSite=Lax','owned=synthetic; Path=/; Secure']);res.setHeader('clear-site-data','"cookies"');res.end('cookie fixture');}
    else {res.end(JSON.stringify({path:req.url,host:req.headers['x-forwarded-host'],proto:req.headers['x-forwarded-proto']}));}});
  const sockets=new WebSocketServer({server:upstream});sockets.on('connection',socket=>{upstreamHits++;socket.on('message',(data,binary)=>socket.send(data,{binary}));});
  const upstreamPort=await listen(upstream);
  const resolver=async():Promise<PreviewTarget|null>=>{
    authorityReads++;if(throws)throw new Error('PRIVATE_DATABASE_CANARY');
    if(admissionDelayMs)await new Promise(resolve=>setTimeout(resolve,admissionDelayMs));
    return allowed?{host:'127.0.0.1',port:upstreamPort,publicHost:host,expiresAt:expiry,revalidate:async()=>allowed}:null;
  };
  const app=express();app.use(createRuntimePreviewGateway(resolver));app.use((_req,res)=>res.status(404).end());
  const gateway=createServer(app);attachRuntimePreviewWebSocketGateway(gateway,resolver);const port=await listen(gateway);
  const clients:WebSocket[]=[];
  return {port,clients,get hits(){return upstreamHits;},get reads(){return authorityReads;},deny:()=>{allowed=false;},expire:()=>{expiry=Date.now()-1;},
    expiresSoon:()=>{expiry=Date.now()+200;},unavailable:()=>{throws=true;},async cleanup(){for(const s of clients)s.terminate();for(const s of sockets.clients)s.terminate();sockets.close();await close(gateway);await close(upstream);}};
}
async function connect(f:Awaited<ReturnType<typeof fixture>>){const socket=new WebSocket(`ws://127.0.0.1:${f.port}/hmr?session=fixture`,{headers:{host}});f.clients.push(socket);await once(socket,'open');return socket;}

test('slow admission still checks current authority before connecting',async()=>{
  const allowed=await fixture(5200),revoked=await fixture(5200);
  try{
    const pending=read(revoked.port);setTimeout(()=>revoked.deny(),50);
    const [good,bad]=await Promise.all([read(allowed.port),pending]);
    assert.equal(good.status,200);assert.equal(allowed.hits,1);
    assert.equal(bad.status,410);assert.equal(revoked.hits,0);
  }finally{await Promise.all([allowed.cleanup(),revoked.cleanup()]);}
});

test('a stalled admission times out without connecting to the worker',async()=>{
  const f=await fixture(15500);
  try{
    assert.equal((await read(f.port)).status,410);
    await new Promise(resolve=>setTimeout(resolve,700));
    assert.equal(f.hits,0);
  }finally{await f.cleanup();}
});

test('real HTTP proxy retains paths and public origin and rewrites only the worker redirect',async()=>{
  const f=await fixture();try{
    const page=await read(f.port,'/asset?q=1');assert.equal(page.status,200);
    assert.deepEqual(JSON.parse(page.body),{path:'/asset?q=1',host,proto:'https'});
    assert.equal((await read(f.port,'/redirect')).location,`https://${host}/asset?q=1`);
    f.deny();assert.equal((await read(f.port)).status,410);assert.equal(f.hits,2);
  }finally{await f.cleanup();}
});

test('real WebSocket messages and authorized reconnect work, then expiry closes both channels and rejects reconnect',async()=>{
  const f=await fixture();try{
    const first=await connect(f);const reply=once(first,'message');first.send('hmr-one');assert.equal(String((await reply)[0]),'hmr-one');
    const closed=once(first,'close');first.close();await closed;
    f.expiresSoon();const second=await connect(f);const secondReply=once(second,'message');second.send('hmr-two');assert.equal(String((await secondReply)[0]),'hmr-two');
    await once(second,'close');f.expire();
    const rejected=new WebSocket(`ws://127.0.0.1:${f.port}/hmr`,{headers:{host}});f.clients.push(rejected);
    rejected.on('error',()=>{});const response=await once(rejected,'unexpected-response');assert.equal(response[1].statusCode,410);rejected.terminate();
    assert.equal(f.hits,2);assert.ok(f.reads>=3);
  }finally{await f.cleanup();}
});

test('untrusted Preview response cannot set parent-domain cookies or clear the main application cookies',async()=>{
  const f=await fixture();try{
    const result=await read(f.port,'/cookies');assert.equal(result.status,200);
    assert.deepEqual(result.headers['set-cookie'],['preview-session=synthetic; Path=/; HttpOnly; Secure; SameSite=Lax','owned=synthetic; Path=/; Secure']);
    assert.equal(result.headers['clear-site-data'],undefined);
  }finally{await f.cleanup();}
});

test('expired admission and authority failure do not make any upstream connection or expose private errors',async()=>{
  const f=await fixture();try{
    f.expire();assert.equal((await read(f.port)).status,410);assert.equal(f.hits,0);
    f.unavailable();const denied=await read(f.port);assert.equal(denied.status,410);assert.ok(!denied.body.includes('CANARY'));assert.equal(f.hits,0);
  }finally{await f.cleanup();}
});
