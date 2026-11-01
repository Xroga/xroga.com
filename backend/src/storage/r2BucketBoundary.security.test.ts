import test from 'node:test';
import assert from 'node:assert/strict';
import { S3Client } from '@aws-sdk/client-s3';
import { R2ObjectStore } from './r2ObjectStore.js';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const cfg={accountId:'syntheticaccount',accessKeyId:'synthetic-key',secretAccessKey:'synthetic-secret',bucket:'private-owned'};
test('every private R2 operation rejects a bucket outside its configured capability before SDK or presigner use',async t=>{
  let sends=0;
  const client=new S3Client({region:'auto',endpoint:'https://syntheticaccount.r2.cloudflarestorage.com',credentials:{accessKeyId:cfg.accessKeyId,secretAccessKey:cfg.secretAccessKey}});
  t.after(()=>client.destroy());t.mock.method(client,'send',async()=>{sends++;return{};});
  const store=new R2ObjectStore(cfg,client);
  const foreign='foreign-private';const stream=async function*(){yield Buffer.from('fixture');};
  const operations=[
    ()=>store.presignPut({bucket:foreign,key:'k',contentType:'text/plain',size:1,ttlSeconds:60}),
    ()=>store.presignGet({bucket:foreign,key:'k',contentType:'text/plain',contentDisposition:'attachment',ttlSeconds:60}),
    ()=>store.head(foreign,'k'),()=>store.readRange(foreign,'k',0,1),()=>store.openRead(foreign,'k'),
    ()=>store.put(foreign,'k',Buffer.from('x'),'text/plain','a'.repeat(64)),
    ()=>store.putStream(foreign,'k',stream(),1,'text/plain'),()=>store.delete(foreign,'k'),
    ()=>store.createMultipart(foreign,'k','text/plain'),()=>store.presignPart(foreign,'k','u',1,60,1),
    ()=>store.uploadPart(foreign,'k','u',1,Buffer.from('x')),()=>store.listParts(foreign,'k','u'),
    ()=>store.completeMultipart(foreign,'k','u',[{partNumber:1,etag:'fixture'}]),()=>store.abortMultipart(foreign,'k','u'),
    ()=>store.list(foreign,'prefix'),
  ];
  for(const [index,operation] of operations.entries())await t.test(`private operation ${index+1}`,()=>assert.rejects(operation(),/configured private bucket/));
  assert.equal(sends,0);
});

test('R2 account configuration cannot turn the fixed provider origin into a URL-selected host',()=>{
  for(const accountId of ['x@127.0.0.1:9999/','x.example/?','x#','x/y','x\\y','x:443','x\nheader'])
    assert.throws(()=>new R2ObjectStore({...cfg,accountId}),/R2 account/);
});

test('the real AWS HTTP transport refuses redirects without copying a signed private request',async()=>{
  let forwarded=0,requests=0;
  const destination=createServer((_req,res)=>{forwarded++;res.writeHead(200).end();});
  const source=createServer((_req,res)=>{requests++;res.writeHead(307,{location:`http://127.0.0.1:${(destination.address() as AddressInfo).port}/private-owned/k`}).end();});
  await new Promise<void>(r=>destination.listen(0,'127.0.0.1',r));
  await new Promise<void>(r=>source.listen(0,'127.0.0.1',r));
  const client=new S3Client({region:'auto',endpoint:`http://127.0.0.1:${(source.address() as AddressInfo).port}`,forcePathStyle:true,
    credentials:{accessKeyId:cfg.accessKeyId,secretAccessKey:cfg.secretAccessKey},maxAttempts:1,followRegionRedirects:false});
  try{
    await assert.rejects(new R2ObjectStore(cfg,client).head(cfg.bucket,'k'));
    assert.equal(requests,1);assert.equal(forwarded,0);
  }finally{
    client.destroy();source.closeAllConnections();destination.closeAllConnections();
    await Promise.all([new Promise<void>(r=>source.close(()=>r())),new Promise<void>(r=>destination.close(()=>r()))]);
  }
});
