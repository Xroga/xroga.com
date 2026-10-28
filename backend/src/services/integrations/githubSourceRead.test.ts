import {createXrogaSoftwareAgentBindings} from '../../ai/softwareAgent/createXrogaSoftwareAgentBindings.js';
import {createXrogaProductionRepositoryAdapter} from '../../ai/softwareAgent/xrogaProductionAdapters.js';
import type {SoftwareExecutionContract} from '../../ai/softwareAgent/contracts.js';
import {createTenantContext} from '../../security/tenantContext.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sealRuntimeCredential } from './credentialVaultRuntime.js';
import { inspectConnectedRepositoryState, fetchRepositoryTextFilesFromGitHub, fetchGitHubFilesByPaths, fetchBuildFilesFromGitHub } from './githubDeploy.js';

test('real source callers reject revocation, same-token rotation and disconnect during response bodies without partial snapshots', async t => {
  const keys=['NODE_ENV','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'], old=keys.map(k=>process.env[k]);
  Object.assign(process.env,{NODE_ENV:'test',SUPABASE_URL:'http://127.0.0.1:55439',SUPABASE_SERVICE_ROLE_KEY:'synthetic-only'});
  t.after(()=>keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];}));
  const owner=randomUUID(), revision=randomUUID(), rotatedRevision=randomUUID(), repo='owned/repository', head='1'.repeat(40),tree='2'.repeat(40),blob='3'.repeat(40);
  const envelope=await sealRuntimeCredential(owner,{provider:'github',account:'github',credentialType:'oauth-token',recordId:'github',revision,scope:'github-connection'},'synthetic-read-only-token');
  const context=createTenantContext({userId:owner,via:'local_jwt'});
  let mode='ok', changed=false, externalReads=0, credentialReads=0;
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    const url=new URL(String(input));
    if(url.origin==='https://api.github.com'){
      externalReads++; assert.equal(init?.redirect,'manual');
      assert.equal(new Headers(init?.headers).get('authorization'),'Bearer synthetic-read-only-token');
      assert.ok(url.pathname.startsWith('/repos/'+repo));
      let data: unknown={size:1};
      if(url.pathname.endsWith('/branches/main')) data={commit:{commit:{tree:{sha:tree}}}};
      if(url.pathname.endsWith('/git/ref/heads/main')) data={object:{sha:head}};
      if(url.pathname.endsWith('/git/commits/'+head)) data={tree:{sha:tree}};
      if(url.pathname.endsWith('/git/trees/'+tree)) data={sha:tree,truncated:false,tree:[{path:'src/main.ts',type:'blob',mode:'100644',sha:blob,size:20},...(mode==='providerDeniedAtBlob'?[{path:'src/other.ts',type:'blob',mode:'100644',sha:'4'.repeat(40),size:20}]:[])]};
      if(url.pathname.includes('/git/blobs/')||url.pathname.includes('/contents/')) data={encoding:'base64',content:Buffer.from('owned source').toString('base64')};
      if(mode==='providerDeniedAtBlob'&&url.pathname.endsWith('/git/blobs/'+blob))return Response.json({message:'SYNTHETIC_PROVIDER_DENIAL'},{status:403});
      if(mode!=='ok'&&mode!=='providerDeniedAtBlob' && (mode!=='rotateAtBlob'||url.pathname.includes('/git/blobs/'))) return new Response(new ReadableStream({pull(controller){changed=true;controller.enqueue(new TextEncoder().encode(JSON.stringify(data)));controller.close();}}));
      return Response.json(data);
    }
    credentialReads++;assert.equal(url.origin,process.env.SUPABASE_URL);
    assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
    if(url.pathname==='/rest/v1/github_integrations') return Response.json({user_id:owner,access_token:changed&&mode==='disconnect'?'':envelope,repo_strategy:'auto',default_repo:repo});
    assert.equal(url.pathname,'/rest/v1/user_integrations');
    return Response.json({user_id:owner,provider:'github',access_token:envelope,credential_revision:changed&&mode.startsWith('rotate')?rotatedRevision:revision,
      metadata:{vault_format:'github-oauth-v1',vault_revision:revision,revoked:changed&&mode==='revoke'}});
  });
  for(const actor of [undefined,{...context},createTenantContext({userId:randomUUID(),via:'local_jwt'})]) {
    const before=credentialReads;
    for(const call of [()=>inspectConnectedRepositoryState(owner,repo,'main',actor),()=>fetchRepositoryTextFilesFromGitHub(owner,repo,'main',actor),()=>fetchGitHubFilesByPaths(owner,repo,['src/main.ts'],'main',actor),()=>fetchBuildFilesFromGitHub(owner,repo,'main',actor)]) await assert.rejects(call());
    assert.equal(credentialReads,before,'All four real read helpers require original owner before vault access');assert.equal(externalReads,0);
  }
  const callers=[()=>inspectConnectedRepositoryState(owner,repo,undefined,context),()=>fetchRepositoryTextFilesFromGitHub(owner,repo,'main',context),()=>fetchGitHubFilesByPaths(owner,repo,['src/main.ts'],'main',context),()=>fetchBuildFilesFromGitHub(owner,repo,'main',context)];
  assert.equal((await inspectConnectedRepositoryState(owner,repo,undefined,context)).status,'head');
  assert.deepEqual(await fetchRepositoryTextFilesFromGitHub(owner,repo,'main',context),[{path:'src/main.ts',content:'owned source'}]);
  assert.deepEqual(await fetchGitHubFilesByPaths(owner,repo,['src/main.ts'],'main',context),[{path:'src/main.ts',content:'owned source'}]);
  const contract:SoftwareExecutionContract={runId:randomUUID(),taskKind:'existing_repo_change',goal:'Read owned source',repository:{owner:'owned',repo:'repository',branch:'main'},writePolicy:{allowedPaths:[],deniedPaths:[],allowCreate:false,allowDelete:false,allowRename:false},preview:'not_applicable',verificationAuthority:'universal',persistence:'none',deployment:'forbidden',acceptanceCriteria:[],constraints:[]};
  const noEffect=async()=>{throw Error('No mutation, model, browser or sandbox operation is part of this source read');};
  const implementations={runSandboxCommand:noEffect,runProjectChecks:noEffect,verifyProjectPreview:noEffect,createReviewBranch:noEffect};
  const bindings=createXrogaSoftwareAgentBindings({userId:owner,tenantContext:context,implementations});assert.equal(bindings.tenantContext,context);
  assert.deepEqual(await createXrogaProductionRepositoryAdapter(bindings).loadFiles(contract),[{path:'src/main.ts',content:'owned source'}]);
  for(const actor of [undefined,{...context},createTenantContext({userId:randomUUID(),via:'local_jwt'})]){const before=credentialReads,wire=externalReads;await assert.rejects(createXrogaProductionRepositoryAdapter(createXrogaSoftwareAgentBindings({userId:owner,tenantContext:actor,implementations})).loadFiles(contract));assert.equal(credentialReads,before);assert.equal(externalReads,wire);}
  for(const scenario of ['revoke','rotate','disconnect']) for(const caller of callers){
    mode=scenario;changed=false;const before=externalReads;
    await assert.rejects(caller(),/authorization changed/);
    assert.equal(externalReads,before+1,'No later request or fallback after in-flight invalidation');
  }
  mode='rotateAtBlob';changed=false;const before=externalReads;
  await assert.rejects(fetchRepositoryTextFilesFromGitHub(owner,repo,'main',context),/authorization changed/);
  assert.equal(externalReads,before+3,'A rotation after successful branch/tree reads invalidates the whole hydration snapshot');
  mode='providerDeniedAtBlob';changed=false;
  await assert.rejects(fetchRepositoryTextFilesFromGitHub(owner,repo,'main',context),/authorization changed/,'Provider authorization denial must not return a partial snapshot from other successful blob reads');
});
