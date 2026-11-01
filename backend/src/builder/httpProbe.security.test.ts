import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import type {IncomingMessage} from 'node:http';
import {httpProbe} from './phase2Bridge.js';
import type {PublicGetTransport} from '../security/boundedPublicGet.js';

function response(text:string,statusCode=200,headers:Record<string,string>={}):IncomingMessage {
  return Object.assign(Readable.from([Buffer.from(text)]),{statusCode,headers}) as IncomingMessage;
}

test('Builder deployment probe admits public HTTPS and independently rejects redirected private DNS',async()=>{
  const opened:string[]=[];
  const io:PublicGetTransport={resolve:async host=>[{address:host==='private.fixture'?'169.254.169.254':'8.8.8.8',family:4}],open:async url=>{opened.push(url.href);return url.pathname==='/redirect'?response('',302,{location:'https://private.fixture/metadata'}):response('working');}};
  assert.deepEqual(await httpProbe('https://public.fixture/',io),{status:200,bytes:7,protectedBySso:false,errorMarker:null});
  assert.equal((await httpProbe('https://public.fixture/redirect',io)).status,null);
  assert.deepEqual(opened,['https://public.fixture/','https://public.fixture/redirect']);
  for(const url of ['https://127.0.0.1/','https://user:secret@public.fixture/','http://public.fixture/','https://public.fixture:444/'])assert.equal((await httpProbe(url,io)).status,null);
  assert.equal(opened.length,2);
});

test('Builder deployment probe retains bounded SSO diagnostics and refuses oversized pages',async()=>{
  const io:PublicGetTransport={resolve:async()=>[{address:'8.8.8.8',family:4}],open:async()=>response('Vercel authentication required',401)};
  const sso=await httpProbe('https://public.fixture/',io);assert.equal(sso.status,401);assert.equal(sso.protectedBySso,true);
  io.open=async()=>response('x'.repeat(65*1024));assert.equal((await httpProbe('https://public.fixture/',io)).status,null);
});
