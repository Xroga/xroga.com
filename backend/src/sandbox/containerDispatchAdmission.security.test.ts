import test from 'node:test';
import assert from 'node:assert/strict';
import {buildContainerArgs,ContainerSandboxRuntime} from './sandboxProviders.js';
import {DEFAULT_SANDBOX_LIMITS,type SandboxExecutionRequest} from './sandboxTypes.js';
const request=():SandboxExecutionRequest=>({files:[],command:'node',args:['-e','process.exit(0)'],timeoutMs:1000,networkPolicy:'none',environment:{PATH:'/usr/bin'},limits:{...DEFAULT_SANDBOX_LIMITS}});
test('container image cannot become Docker command-line flags',()=>{for(const image of ['--privileged','-v','node:20 --network host','node:20\n--privileged',''])assert.throws(()=>buildContainerArgs(image,request()));});
test('container runtime refuses unsupported network modes instead of unrestricted bridge',()=>{for(const networkPolicy of ['preview','restricted'] as const)assert.throws(()=>buildContainerArgs('node:20-alpine',{...request(),networkPolicy}));});
test('container build environment refuses raw and relabelled held server credentials',()=>{
 const name='XROGA_SANDBOX_FIXTURE_API_KEY',old=process.env[name];process.env[name]='synthetic-held-control-plane-value';
 try{for(const environment of ([{SUPABASE_SERVICE_ROLE_KEY:'synthetic-secret'}, {DISPLAY:'synthetic-held-control-plane-value'}, {DISPLAY:Buffer.from('synthetic-held-control-plane-value').toString('base64')}] as Record<string,string>[]))assert.throws(()=>buildContainerArgs('node:20-alpine',{...request(),environment}));}
 finally{if(old===undefined)delete process.env[name];else process.env[name]=old;}
});
test('bad image and pre-cancellation deny before runtime probe',async()=>{
 class Controlled extends ContainerSandboxRuntime {probes=0;override async probe(){this.probes++;return{available:false,runtime:'test',reason:'runtime_unavailable' as const};}}
 const runtime=new Controlled({binary:'synthetic-must-not-execute'});
 await assert.rejects(runtime.execute({...request(),image:'--privileged'}));assert.equal(runtime.probes,0);
 await assert.rejects(runtime.execute({...request(),signal:AbortSignal.abort()}));assert.equal(runtime.probes,0);
});

test('sandbox image selection cannot cause a daemon-side registry fetch',()=>{const args=buildContainerArgs('node:22-bookworm',request());assert.equal(args[args.indexOf('--pull')+1],'never');});

test('disabled or malformed process limits deny before the runtime probe',async()=>{
 class Controlled extends ContainerSandboxRuntime {probes=0;override async probe(){this.probes++;return{available:false,runtime:'test',reason:'runtime_unavailable' as const};}}
 for(const extra of [{timeoutMs:0},{timeoutMs:Infinity},{limits:{...DEFAULT_SANDBOX_LIMITS,memoryMb:0}},{limits:{...DEFAULT_SANDBOX_LIMITS,maxProcesses:-1}},{command:''},{args:['\0']}]){
  const runtime=new Controlled({binary:'synthetic-must-not-execute'});await assert.rejects(runtime.execute({...request(),...extra}));assert.equal(runtime.probes,0);
 }
});

test('the local container adapter cannot replace production Google execution',async()=>{
 const old=process.env.NODE_ENV;process.env.NODE_ENV='production';
 try{class Controlled extends ContainerSandboxRuntime {probes=0;override async probe(){this.probes++;return{available:false,runtime:'test',reason:'runtime_unavailable' as const};}}
  const runtime=new Controlled({binary:'synthetic-must-not-execute'});await assert.rejects(runtime.execute(request()));assert.equal(runtime.probes,0);
 }finally{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old;}
});

test('disposable containers cannot accumulate independent daemon log files',()=>{
 const args=buildContainerArgs('node:22-bookworm',request());assert.equal(args[args.indexOf('--log-driver')+1],'none');
 assert.equal(args.includes('--log-opt'),false);
});
