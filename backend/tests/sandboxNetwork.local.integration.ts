/** Real local Docker, pre-existing image only. No cloud or provider operation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {ContainerSandboxRuntime} from '../src/sandbox/sandboxProviders.js';
import {DEFAULT_SANDBOX_LIMITS} from '../src/sandbox/sandboxTypes.js';

if(process.env.XB01_SANDBOX_CONTAINER_PROOF!=='1')throw Error('Explicit disposable local container proof required');
const image='node@sha256:63538dfe497cc29dfafdda25ada09b46db68a3f4cc205abf1f5d6bf0913f3384';
execFileSync('docker',['image','inspect',image],{stdio:'ignore'});
test('actual no-network container installs an offline package and cannot reach public, private or metadata networks',async()=>{
  const script=`
    const fs=require('node:fs'),os=require('node:os'),net=require('node:net'),cp=require('node:child_process');
    const assert=require('node:assert/strict');
    assert.deepEqual(Object.keys(os.networkInterfaces()).filter(k=>k!=='lo'),[]);
    assert.ok(!fs.readFileSync('/proc/net/route','utf8').split('\\n').slice(1).some(l=>/\\s00000000\\s/.test(l)));
    fs.mkdirSync('/work/dependency',{recursive:true});
    fs.writeFileSync('/work/dependency/package.json',JSON.stringify({name:'xroga-synthetic-local',version:'1.0.0',main:'index.js'}));
    fs.writeFileSync('/work/dependency/index.js','module.exports="offline-success"');
    fs.writeFileSync('/work/package.json',JSON.stringify({name:'xroga-network-proof',version:'1.0.0',dependencies:{'xroga-synthetic-local':'file:./dependency'}}));
    const install=cp.spawnSync('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund','--cache','/work/.npm'],{cwd:'/work',encoding:'utf8',timeout:20000});
    assert.equal(install.status,0,'Offline installation failed');
    assert.equal(require('/work/node_modules/xroga-synthetic-local'),'offline-success');
    (async()=>{
      for(const host of ['8.8.8.8','10.0.0.1','172.16.0.1','192.168.0.1','169.254.169.254','100.100.100.200','fc00::1']){
        await new Promise((resolve,reject)=>{const s=net.connect({host,port:80});s.setTimeout(300);s.once('connect',()=>{s.destroy();reject(Error('Network escaped'));});s.once('error',()=>resolve());s.once('timeout',()=>{s.destroy();resolve();});});
      }
      console.log('OFFLINE_INSTALL_AND_KERNEL_NETWORK_DENIAL_VERIFIED');
    })().catch(()=>process.exitCode=1);
  `;
  // This disposable proof needs one CPU. Production defaults request five CPUs,
  // which Docker correctly rejects on the four-CPU GitHub runner.
  const limits={...DEFAULT_SANDBOX_LIMITS,cpuSeconds:60};
  const result=await new ContainerSandboxRuntime({binary:'docker',image}).execute({files:[],command:'node',args:['-e',script],timeoutMs:30000,networkPolicy:'none',environment:{HOME:'/work'},limits});
  assert.equal(result.exitCode,0,JSON.stringify(result));
  assert.match(result.stdout,/OFFLINE_INSTALL_AND_KERNEL_NETWORK_DENIAL_VERIFIED/);
  assert.equal(result.timedOut,false);
});
