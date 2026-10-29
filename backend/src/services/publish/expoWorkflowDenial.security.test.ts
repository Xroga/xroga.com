import test from 'node:test';import assert from 'node:assert/strict';import{randomUUID}from'node:crypto';
import{triggerEasPublish}from'./easPublish.js';import{createTenantContext}from'../../security/tenantContext.js';import{isTerminalModelFailure}from'../../ai/providerRuntime.js';

test('Expo workflow authorization denial cannot dispatch a build-only fallback',async t=>{
 const owner=randomUUID(),project=randomUUID(),context=createTenantContext({userId:owner,via:'remote_getuser'});
 const env={NODE_ENV:'test',SUPABASE_URL:'https://expo-workflow-denial.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture'},old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 t.after(()=>{for(const[k,v]of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;});
 let status=403,dispatches=0,metadataReads=0;
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  const url=new URL(String(input));
  if(url.origin===env.SUPABASE_URL){if(url.pathname.endsWith('/github_integrations')||url.searchParams.get('provider')==='eq.github')return Response.json({user_id:owner,provider:'github',access_token:'synthetic-github',credential_revision:null,metadata:{}});const provider=url.searchParams.get('provider')?.slice(3)??'';return Response.json({user_id:owner,provider,access_token:'enc:'+Buffer.from('fixture:synthetic-expo').toString('base64'),credential_revision:null,metadata:{}});}
  if(url.pathname==='/v2/workflows/dispatch')dispatches++;
  assert.equal(url.href,'https://api.expo.dev/graphql');metadataReads++;
  return Response.json({message:'workflow not found PRIVATE_PROVIDER_CANARY'},{status});
 });
 for(status of [401,403])await t.test(String(status),async()=>{dispatches=0;metadataReads=0;const input={userId:owner,tenantContext:context,projectId:project,platform:'android' as const,submit:true};await assert.rejects(triggerEasPublish(input),error=>{assert.equal(isTerminalModelFailure(error),true);assert.doesNotMatch((error as Error).message,/PRIVATE_PROVIDER_CANARY/);return true;});assert.equal(dispatches,0);assert.equal(metadataReads,1);});
});
