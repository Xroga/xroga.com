import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {sealRuntimeCredential} from './credentialVaultRuntime.js';
import {createGitHubSourceReader} from './githubSourceRead.js';
import {createTenantContext,type TenantContext} from '../../security/tenantContext.js';
import {isTerminalModelFailure} from '../../ai/providerRuntime.js';

test('GitHub source read denies encoded repository escape, redirect retry and pre-aborted dispatch',async t=>{
 const old=Object.fromEntries(['NODE_ENV','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'].map(k=>[k,process.env[k]]));
 Object.assign(process.env,{NODE_ENV:'test',SUPABASE_URL:'http://127.0.0.1:55439',SUPABASE_SERVICE_ROLE_KEY:'synthetic-only'});
 t.after(()=>{for(const[k,v]of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;});
 const owner=randomUUID(),revision=randomUUID(),token='synthetic-read-only-token',repo='owned/repository';
 const envelope=await sealRuntimeCredential(owner,{provider:'github',account:'github',credentialType:'oauth-token',recordId:'github',revision,scope:'github-connection'},token);
 const context=createTenantContext({userId:owner,via:'local_jwt'});
 let mode='ok',wire=0,outside=0,credentialReads=0;const native=globalThis.fetch;
 const sink=createServer((_req,res)=>{outside++;res.writeHead(200).end('{}');});
 const source=createServer((_req,res)=>res.writeHead(307,{location:`http://127.0.0.1:${(sink.address() as AddressInfo).port}/collect`}).end());
 await new Promise<void>(r=>sink.listen(0,'127.0.0.1',r));await new Promise<void>(r=>source.listen(0,'127.0.0.1',r));
 t.after(async()=>{source.closeAllConnections();sink.closeAllConnections();await Promise.all([new Promise<void>(r=>source.close(()=>r())),new Promise<void>(r=>sink.close(()=>r()))]);});
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  const url=new URL(String(input));if(url.origin==='https://api.github.com'){wire++;if(mode==='unavailable')return new Response('unavailable',{status:503});if(mode==='redirect')return native(`http://127.0.0.1:${(source.address() as AddressInfo).port}/`,init);return Response.json({owned:true});}
  credentialReads++;assert.equal(url.origin,process.env.SUPABASE_URL);assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
  if(url.pathname==='/rest/v1/github_integrations')return Response.json({user_id:owner,access_token:envelope,repo_strategy:'auto',default_repo:repo});
  assert.equal(url.pathname,'/rest/v1/user_integrations');return Response.json({user_id:owner,provider:'github',access_token:envelope,credential_revision:revision,metadata:{vault_format:'github-oauth-v1',vault_revision:revision}});
 });
 await t.test('only original owner context may read credentials',async()=>{for(const actor of [undefined,{...context},createTenantContext({userId:randomUUID(),via:'local_jwt'})]){const before=credentialReads;await assert.rejects(createGitHubSourceReader(owner,token,repo,actor as TenantContext));assert.equal(credentialReads,before);assert.equal(wire,0);}});
 await t.test('held server and selected credentials cannot be smuggled through read paths',async()=>{
  const key='PHASE4_HELD_API_KEY',old=process.env[key];process.env[key]='synthetic-control-plane-key-value';
  try{for(const secret of [process.env[key],Buffer.from(process.env[key]).toString('base64'),token,Buffer.from(token).toString('base64url')]){const before=wire;const reader=await createGitHubSourceReader(owner,token,repo,context);await assert.rejects(reader.request(token,`/repos/${repo}/contents/${encodeURIComponent(secret)}`));assert.equal(wire,before);}}
  finally{if(old===undefined)delete process.env[key];else process.env[key]=old;}
 });
 await t.test('encoded path escape denied before wire',async()=>{let reader=await createGitHubSourceReader(owner,token,repo,context);await assert.rejects(reader.request(token,`/repos/${repo}/%2e%2e/%2e%2e/foreign/private`));assert.equal(wire,0);});
 await t.test('redirect is terminal and invalidates the source lifetime',async()=>{mode='redirect';wire=0;let reader=await createGitHubSourceReader(owner,token,repo,context);await assert.rejects(reader.request(token,`/repos/${repo}/contents/package.json`),e=>isTerminalModelFailure(e));await assert.rejects(reader.request(token,`/repos/${repo}/contents/package.json`));assert.equal(wire,1);assert.equal(outside,0);});
 await t.test('ordinary provider failure permits later authorized read and encoded branch names',async()=>{mode='unavailable';wire=0;const reader=await createGitHubSourceReader(owner,token,repo,context);assert.equal((await reader.request(token,`/repos/${repo}/branches/feature%2Fdemo`)).status,503);mode='ok';assert.deepEqual(await(await reader.request(token,`/repos/${repo}/branches/feature%2Fdemo`)).json(),{owned:true});assert.equal(wire,2);});
 await t.test('pre-aborted request never dispatches and cannot resume',async()=>{mode='ok';wire=0;let reader=await createGitHubSourceReader(owner,token,repo,context);await assert.rejects(reader.request(token,`/repos/${repo}/contents/package.json`,{signal:AbortSignal.abort()}));assert.equal(wire,0);await assert.rejects(reader.request(token,`/repos/${repo}/contents/package.json`));assert.equal(wire,0);});
});
