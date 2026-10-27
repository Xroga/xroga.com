import assert from 'node:assert/strict';
import test from 'node:test';
import {watchPreviewAdmission} from './admissionWatch.js';

const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
test('active Preview checks are serialized and explicit connection cleanup stops future reads',async()=>{
  let checks=0,denials=0,active=0,maximum=0;
  const stop=watchPreviewAdmission(async()=>{checks++;active++;maximum=Math.max(maximum,active);await delay(20);active--;return true;},
    ()=>{denials++;},Date.now()+2000,{intervalMs:5,checkTimeoutMs:200});
  try{await delay(65);assert.ok(checks>=1);assert.equal(maximum,1);assert.equal(denials,0);}
  finally{stop();}
  const before=checks;await delay(35);assert.equal(checks,before);assert.equal(denials,0);
});

for(const mode of ['revoked','unavailable','stalled','expired'])test(`Preview ${mode} terminates once without retrying or reconnecting`,async()=>{
  let checks=0,denials=0;let resolveDenied:()=>void=()=>{};
  const denied=new Promise<void>(resolve=>{resolveDenied=resolve;});
  const stop=watchPreviewAdmission(async()=>{
    checks++;if(mode==='unavailable')throw new Error('PRIVATE_READ_CANARY');
    if(mode==='stalled')return new Promise<boolean>(()=>{});return false;
  },()=>{denials++;resolveDenied();},Date.now()+(mode==='expired'?1:2000),{intervalMs:10,checkTimeoutMs:20});
  let timeout:ReturnType<typeof setTimeout>|undefined;
  try{
    await Promise.race([denied,new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Expected denial')),1000);})]);
    assert.equal(denials,1);const before=checks;await delay(35);assert.equal(checks,before);assert.equal(denials,1);
  }finally{stop();if(timeout)clearTimeout(timeout);}
});
