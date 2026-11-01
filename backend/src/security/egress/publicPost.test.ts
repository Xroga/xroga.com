import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import type { LookupFunction } from 'node:net';
import { boundedPublicPost, type PublicPostTransport } from './urlPolicy.js';

function response(statusCode=200,body='receipt',headers={}) {
  return Object.assign(Readable.from([Buffer.from(body)]),{statusCode,headers}) as IncomingMessage;
}
test('upload pins the admitted address, awaits live authorization and never exposes response content',async()=>{
  const order:string[]=[];
  const bytes=Buffer.from('synthetic ordinary file');let copied:Buffer|undefined;
  const io:PublicPostTransport={resolve:async()=>{order.push('resolve');return [{address:'8.8.8.8',family:4}];},
    open:async(url,pin,signal,body)=>{
      order.push('send');assert.equal(url.hostname,'provider.example');assert.equal(signal.aborted,false);
      const address=await new Promise((resolve,reject)=>(pin as LookupFunction)('provider.example',{},(error,ip)=>error?reject(error):resolve(ip)));
      assert.equal(address,'8.8.8.8');assert.deepEqual(body,bytes);copied=body;
      return response(201,'untrusted provider body');
    }};
  const receipt=await boundedPublicPost('https://provider.example/upload',bytes,'text/plain',async()=>{order.push('authorize');},io);
  assert.deepEqual(order,['resolve','authorize','send']);assert.equal(receipt.statusCode,201);
  assert.match(receipt.bodyDigest,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(receipt).includes('untrusted'));
  assert.ok(copied?.every(byte=>byte===0));assert.equal(bytes.toString(),'synthetic ordinary file');
});
test('mixed DNS and revoked authorization stop upload before the first effect',async()=>{
  let effects=0;
  const io:PublicPostTransport={resolve:async()=>[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}],open:async()=>{effects++;return response();}};
  await assert.rejects(boundedPublicPost('https://provider.example',Buffer.from('safe'),'text/plain',async()=>{},io),/DNS target denied/);
  io.resolve=async()=>[{address:'8.8.8.8',family:4}];
  await assert.rejects(boundedPublicPost('https://provider.example',Buffer.from('safe'),'text/plain',async()=>{throw Error('revoked private detail');},io),/outcome unavailable/);
  assert.equal(effects,0);
});
test('redirects, compression and oversized receipts fail closed with no second attempt',async()=>{
  for(const result of [response(307,'',{location:'https://127.0.0.1'}),response(200,'encoded',{'content-encoding':'gzip'}),response(200,'x'.repeat(8193))]){
    let effects=0;
    const io:PublicPostTransport={resolve:async()=>[{address:'8.8.8.8',family:4}],open:async()=>{effects++;return result;}};
    await assert.rejects(boundedPublicPost('https://provider.example',Buffer.from('safe'),'text/plain',async()=>{},io));
    assert.equal(effects,1);
  }
});
test('invalid upload size and header injection are rejected without DNS or effects',async()=>{
  const io:PublicPostTransport={resolve:async()=>{throw Error('must not resolve');},open:async()=>{throw Error('must not send');}};
  for(const [body,type] of [[Buffer.alloc(0),'text/plain'],[Buffer.alloc(128001),'text/plain'],[Buffer.from('safe'),'text/plain\r\nAuthorization: secret']] as const)
    await assert.rejects(boundedPublicPost('https://provider.example',body,type,async()=>{},io),/Invalid upload/);
});
