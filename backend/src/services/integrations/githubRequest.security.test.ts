import test from 'node:test';import assert from 'node:assert/strict';
import {ghFetch} from './githubDeploy.js';
import {randomUUID} from 'node:crypto';
import {createTenantContext} from '../../security/tenantContext.js';
import {createGitHubRequestScope,type GitHubRequestScope} from './githubRequest.js';

test('shared GitHub transport cannot dispatch a raw-token write without original actor and native authority',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({sha:'a'.repeat(40)});});
 await assert.rejects(ghFetch('synthetic-unscoped-credential','/repos/Owner/repo/git/refs',{method:'POST',body:JSON.stringify({ref:'refs/heads/main',sha:'a'.repeat(40)})}));
 assert.equal(calls,0);
});

test('GitHub reads bind original actor, repository and current credential, with terminal denials and bounded output',async t=>{
 const owner=randomUUID(),actor=createTenantContext({userId:owner,via:'remote_getuser'}),env={NODE_ENV:'test',SUPABASE_URL:'https://github-request-fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-store'},prior=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);t.after(()=>{for(const[k,v]of Object.entries(prior))if(v===undefined)delete process.env[k];else process.env[k]=v;});
 let provider=0,revision='original',mode='ok',cancelled=false;
 const token='synthetic-gh-credential';
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  const url=new URL(String(input));if(url.origin===env.SUPABASE_URL)return Response.json({user_id:owner,provider:'github',access_token:token,credential_revision:revision,metadata:{}});
  provider++;assert.equal(url.origin,'https://api.github.com');assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+token);assert.equal(init?.redirect,'manual');assert.ok(init?.signal);
  if(mode==='redirect')return Response.redirect('https://attacker.example',307);
  if(mode==='auth403')return Response.json({message:token},{status:403});
  if(mode==='outage')return Response.json({message:token},{status:503});
  if(mode==='network')throw Error(token);
  if(mode==='malformed')return new Response(token);
  if(mode==='oversized')return new Response(new ReadableStream({pull(c){c.enqueue(new Uint8Array(1024*1024));},cancel(){cancelled=true;}}));
  return Response.json({full_name:'Owner/repo'});
 });
 for(const context of [{...actor},JSON.parse(JSON.stringify(actor))])await assert.rejects(createGitHubRequestScope(context,token,'Owner/repo'),{code:'TENANT_AUTH_REQUIRED'});assert.equal(provider,0);
 const open=()=>createGitHubRequestScope(actor,token,'Owner/repo');
 const selected=await open();try{const res=await ghFetch(token,'/repos/Owner/repo',{headers:{Authorization:'Bearer fabricated'},redirect:'follow'},selected.scope);assert.equal(res.status,200);assert.deepEqual(await res.json(),{full_name:'Owner/repo'});}finally{selected.close();}
 for(const scope of [{marker:'github-request-scope'},actor])await assert.rejects(ghFetch(token,'/repos/Owner/repo',undefined,scope as GitHubRequestScope));
 for(const path of ['/repos/Foreign/repo','//attacker.example/path','/repos/Owner/repo/../foreign','/repos/Owner/repo/contents/%2e%2e/key','/repos/Owner/repo?credential=private','/repos/Owner/repo/contents/'+token]){const scoped=await open(),before:number=provider;try{await assert.rejects(ghFetch(token,path,undefined,scoped.scope));assert.equal(provider,before);}finally{scoped.close();}}
 for(mode of ['redirect','auth403','malformed','oversized']){const scoped=await open(),before:number=provider;try{await assert.rejects(ghFetch(token,'/repos/Owner/repo',undefined,scoped.scope),error=>{assert.doesNotMatch(String(error),new RegExp(token));return true;});assert.equal(provider,before+1);mode='ok';await assert.rejects(ghFetch(token,'/repos/Owner/repo',undefined,scoped.scope));assert.equal(provider,before+1);}finally{scoped.close();}}
 assert.equal(cancelled,true);
 mode='outage';const recoverable=await open();try{const failed=await ghFetch(token,'/repos/Owner/repo',undefined,recoverable.scope);assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes(token));mode='ok';assert.equal((await ghFetch(token,'/repos/Owner/repo',undefined,recoverable.scope)).status,200);}finally{recoverable.close();}
 mode='ok';const changed=await open(),before:number=provider;revision='replaced-even-with-same-token';await assert.rejects(ghFetch(token,'/repos/Owner/repo',undefined,changed.scope));assert.equal(provider,before);changed.close();
 const readOnly=await open();try{await assert.rejects(ghFetch(token,'/repos/Owner/repo/git/refs',{method:'POST',body:'{}'},readOnly.scope));assert.equal(provider,before);}finally{readOnly.close();}
});
