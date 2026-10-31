import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeJobProcess } from './runCloudJob.mjs';

async function fixture(t,code){const root=await mkdtemp(join(tmpdir(),'xroga-job-process-'));t.after(()=>rm(root,{recursive:true,force:true}));const script=join(root,'fixture.mjs');await writeFile(script,code);return script;}
const input={type:'start',job:{},plan:{}};
const opts=script=>({script,signal:new AbortController().signal,timeoutMs:5000,maxOutputBytes:4096,env:{PATH:process.env.PATH,...(process.env.SystemRoot?{SystemRoot:process.env.SystemRoot}:{})}});
test('real child process returns a result without forwarding its stderr',async t=>{
 const script=await fixture(t,`process.stdin.once('data',()=>{console.error('PRIVATE_DIAGNOSTIC');console.log(JSON.stringify({type:'result',result:{summary:'fixture'}}));process.exit(0)});`);
 assert.deepEqual(await executeJobProcess(input,opts(script)),{summary:'fixture'});
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
