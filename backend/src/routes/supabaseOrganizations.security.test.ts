import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import express from 'express';
import router from './supabaseOAuth.js';
import type {AuthRequest} from '../middleware/auth.js';
import {createTenantContext} from '../security/tenantContext.js';
import {sealRuntimeCredential} from '../services/integrations/credentialVaultRuntime.js';

test('organization listing requires original owner and current connection without redirect or partial receipts',async t=>{
 const names=['NODE_ENV','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];const old=names.map(n=>process.env[n]);
 Object.assign(process.env,{NODE_ENV:'test',SUPABASE_URL:'http://127.0.0.1:55437',SUPABASE_SERVICE_ROLE_KEY:'synthetic-only'});
 t.after(()=>names.forEach((n,i)=>{if(old[i]===undefined)delete process.env[n];else process.env[n]=old[i];}));
 const owner=randomUUID(),revision=randomUUID(),token='synthetic-supabase-organization-token';
 const envelope=await sealRuntimeCredential(owner,{provider:'supabase_oauth',account:'supabase_oauth',credentialType:'oauth-token',recordId:'supabase_oauth',revision,scope:'oauth-connection'},JSON.stringify({access_token:token,refresh_token:null}));
 let mode='ok',wire=0,reads=0,dispatched=false;const native=globalThis.fetch;
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  const url=new URL(String(input));
  if(url.origin===process.env.SUPABASE_URL){reads++;assert.equal(url.searchParams.get('user_id'),'eq.'+owner);assert.equal(url.searchParams.get('provider'),'eq.supabase_oauth');
   if(dispatched&&mode==='disconnect')return Response.json(null);
   return Response.json({user_id:owner,provider:'supabase_oauth',access_token:envelope,refresh_token:null,credential_revision:dispatched&&mode==='rotate'?randomUUID():revision,metadata:{vault_format:'oauth-v1',vault_revision:revision}});
  }
  if(url.origin!=='https://api.supabase.com')return native(input,init);
  wire++;dispatched=true;assert.equal(url.href,'https://api.supabase.com/v1/organizations');assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+token);
  if(mode==='redirect'){assert.equal(init?.redirect,'manual');return new Response(null,{status:307,headers:{location:'https://foreign.invalid/collect'}});}
  if(mode==='large')return new Response('x'.repeat(65537));
  if(mode==='bad')return Response.json({error:'unsafe upstream value'});
  if(mode==='forbidden'||mode==='unavailable')return Response.json({message:'PRIVATE_PROVIDER_CANARY'},{status:mode==='forbidden'?403:503});
  return Response.json([{id:'org-owned',name:'Owner organization',slug:'owned'}]);
 });
 const app=express();app.use((req:AuthRequest,_res,next)=>{req.userId=owner;const context=createTenantContext({userId:mode==='foreign'?randomUUID():owner,via:'local_jwt'});req.tenantContext=mode==='missing'?undefined:mode==='cloned'?{...context}:context;next();});app.use(router);
 const server=createServer(app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();assert.ok(address&&typeof address!=='string');
 t.after(async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));});
 for(const scenario of ['missing','cloned','foreign','redirect','large','bad','forbidden','disconnect','rotate','unavailable','ok'])await t.test(scenario,async()=>{
  mode=scenario;wire=reads=0;dispatched=false;
  const response=await native(`http://127.0.0.1:${address.port}/organizations`);const body=await response.json();
  if(scenario==='ok'){assert.equal(response.status,200);assert.deepEqual(body,{organizations:[{id:'org-owned',name:'Owner organization',slug:'owned'}]});}
  else{assert.notEqual(response.status,200);assert.deepEqual((body as {organizations:unknown[]}).organizations,[]);assert.doesNotMatch(JSON.stringify(body),/PRIVATE_PROVIDER_CANARY|unsafe upstream value/);}
  if(['missing','cloned','foreign'].includes(scenario)){assert.equal(reads,0);assert.equal(wire,0);}else assert.equal(wire,1);
 });
});
