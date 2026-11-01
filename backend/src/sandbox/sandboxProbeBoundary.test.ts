import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join,sep,basename} from 'node:path';
import {ContainerSandboxRuntime} from './sandboxProviders.js';

test('actual sandbox probe child receives only fixed version argument and a scrubbed environment',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'xroga-probe-boundary-')),cwd=process.cwd();
  const keys=['SUPABASE_SERVICE_ROLE_KEY','XROGA_USER_PAYLOAD','NODE_OPTIONS','XROGA_SANDBOX_DISABLED'];
  const old=keys.map(k=>process.env[k]);
  t.after(()=>{
    process.chdir(cwd);keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];});
    const target=resolve(directory),parent=resolve(tmpdir());
    assert.ok(target.startsWith(parent+sep)&&basename(target).startsWith('xroga-probe-boundary-'));
    rmSync(target,{recursive:true});
  });
  // Node is an actual executable test transport, not a mock of child_process.
  // The probe's fixed `version` argument selects this local script. It does not
  // run generated project code or claim that this process is a container.
  writeFileSync(join(directory,'version'),`const assert=require('node:assert/strict');
    assert.equal(process.argv.length,2);
    assert.ok(process.argv[1].endsWith('version'));
    for(const key of ['SUPABASE_SERVICE_ROLE_KEY','XROGA_USER_PAYLOAD','NODE_OPTIONS'])assert.equal(process.env[key],undefined);
    assert.equal(process.env.NODE_ENV,'production');
  `);
  process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-probe-secret';process.env.XROGA_USER_PAYLOAD='synthetic-private-project-data';
  process.env.NODE_OPTIONS='--invalid-option-that-must-never-reach-child';delete process.env.XROGA_SANDBOX_DISABLED;
  process.chdir(directory);
  const result=await new ContainerSandboxRuntime({binary:process.execPath}).probe();
  assert.equal(result.available,true,'Real child asserts exact argv, absent credentials/payload and scrubbed NODE_OPTIONS');
  process.env.XROGA_SANDBOX_DISABLED='1';
  assert.equal((await new ContainerSandboxRuntime({binary:process.execPath+'-unavailable'}).probe()).reason,'policy_disabled');
});
