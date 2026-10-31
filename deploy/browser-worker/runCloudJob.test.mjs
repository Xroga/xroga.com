import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeJobProcess, sandboxCommand } from './runCloudJob.mjs';
import net from 'node:net';
import {createProxyRelay} from './proxyChannel.mjs';

async function fixture(t,code){const root=await mkdtemp(join(tmpdir(),'xroga-job-process-'));t.after(()=>rm(root,{recursive:true,force:true}));const script=join(root,'fixture.mjs');await writeFile(script,code);return script;}
const input={type:'start',job:{},plan:{}};
const opts=script=>({script,signal:new AbortController().signal,timeoutMs:5000,maxOutputBytes:4096,env:{PATH:process.env.PATH,...(process.env.SystemRoot?{SystemRoot:process.env.SystemRoot}:{})}});

test('native sandbox command grants no external network or writable host mount',()=>{
 const command=sandboxCommand(join(tmpdir(),'runner.mjs'),'browser-attempt-1');
 assert.equal(command.executable,'/usr/local/gcp/bin/sandbox');
 assert.deepEqual(command.args.slice(0,2),['run','browser-attempt-1']);
 assert.ok(!command.args.some(arg=>arg==='--allow-egress'||arg==='--write'||arg.startsWith('--mount')));
 assert.throws(()=>sandboxCommand('relative.mjs','browser-attempt-1'));
 assert.throws(()=>sandboxCommand(join(tmpdir(),'runner.mjs'),'../other'));
});
test('real child process returns a result without forwarding its stderr',async t=>{
 const script=await fixture(t,`process.stdin.once('data',()=>{console.error('PRIVATE_DIAGNOSTIC');console.log(JSON.stringify({type:'result',result:{summary:'fixture'}}));process.exit(0)});`);
 assert.deepEqual(await executeJobProcess(input,opts(script)),{summary:'fixture'});
});

test('real child exchanges bounded proxy bytes through stdin/stdout and closes sockets before its result',async t=>{
 const server=net.createServer(socket=>socket.pipe(socket));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const moduleUrl=new URL('./proxyChannel.mjs',import.meta.url).href;
 const script=await fixture(t,`
 import net from 'node:net';import {createInterface} from 'node:readline';
 import {startProxyIngress} from ${JSON.stringify(moduleUrl)};
 const lines=createInterface({input:process.stdin});let ingress;
 const send=m=>new Promise((resolve,reject)=>process.stdout.write(JSON.stringify(m)+'\\n',e=>e?reject(e):resolve()));
 lines.on('line',async line=>{const m=JSON.parse(line);
 if(m.type==='start'){
   ingress=await startProxyIngress({port:0,maxBytes:4*1024*1024,send});
   const socket=net.connect(ingress.port,'127.0.0.1',()=>socket.write(Buffer.alloc(1024*1024,7)));
   let received=0;
   socket.on('data',async bytes=>{if(bytes.some(b=>b!==7))process.exit(2);received+=bytes.length;
     if(received===1024*1024){socket.destroy();await ingress.close();lines.close();await send({type:'result',result:{received}});}
   });
 }else if(m.type.startsWith('proxy-'))ingress.receive(m);
 });`);
 const result=await executeJobProcess(input,{...opts(script),timeoutMs:10000,maxOutputBytes:4*1024*1024,
   channelFactory:(send,onFailure)=>createProxyRelay({proxyPort:server.address().port,maxBytes:4*1024*1024,send,onFailure})});
 assert.equal(result.received,1024*1024);
});
test('real child crash cannot produce success',async t=>{
 const script=await fixture(t,`process.stdin.once('data',()=>process.exit(9));`);
 await assert.rejects(executeJobProcess(input,opts(script)),/INCOMPLETE/);
});
test('cancellation terminates a real uncooperative process and discards a late result',async t=>{
 const script=await fixture(t,`process.stdin.on('data',()=>{});setInterval(()=>{},1000);`);
 const abort=new AbortController();const pending=executeJobProcess(input,{...opts(script),signal:abort.signal});
 abort.abort();await assert.rejects(pending,/CANCELLED/);
});
test('output bounds stop a real child',async t=>{
 const script=await fixture(t,`process.stdin.once('data',()=>{process.stdout.write('x'.repeat(8192));setInterval(()=>{},1000)});`);
 await assert.rejects(executeJobProcess(input,opts(script)),/OUTPUT_LIMIT/);
});
test('model requests fail closed without dispatch',async t=>{
 const script=await fixture(t,`process.stdin.once('data',()=>{console.log(JSON.stringify({type:'llm',prompt:'never dispatch'}));process.exit(0)});`);
 await assert.rejects(executeJobProcess(input,opts(script)),/FAILED/);
});

test('split UTF-8 output preserves the actual result',async t=>{
 const script=await fixture(t,`process.stdin.once('data',()=>{const b=Buffer.from(JSON.stringify({type:'result',result:{summary:'مرحبا'}})+'\\n');const n=b.indexOf(0xd9)+1;process.stdout.write(b.subarray(0,n));setTimeout(()=>{process.stdout.write(b.subarray(n));process.exit(0)},30)});`);
 assert.deepEqual(await executeJobProcess(input,opts(script)),{summary:'مرحبا'});
});

test('malformed child output fails closed without an uncaught callback error',async t=>{
 const script=await fixture(t,`process.stdin.once('data',()=>{console.log('null');process.exit(0)});`);
 await assert.rejects(executeJobProcess(input,opts(script)),/PROTOCOL_INVALID/);
});

test('failed progress persistence stops the child and cannot accept its result',async t=>{
 const script=await fixture(t,`process.stdin.once('data',()=>{console.log(JSON.stringify({type:'progress',index:1}));console.log(JSON.stringify({type:'result',result:{summary:'late'}}));process.exit(0)});`);
 await assert.rejects(executeJobProcess(input,{...opts(script),onProgress(){throw new Error('private storage diagnostic')}}),/PROGRESS_FAILED/);
});
