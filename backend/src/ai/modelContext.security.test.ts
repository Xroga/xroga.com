import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {hydratePriorFiles} from './pipeline.js';
import {modelContextNamespace} from './tenantModelDispatch.js';
import {getProjectMemory,setProjectMemoryDurable} from './projectMemory.js';
import {loadSessionHistory} from './sessionMemory.js';
import {createTenantContext} from '../security/tenantContext.js';
import {sealRuntimeCredential} from '../services/integrations/credentialVaultRuntime.js';

test('actual hydration and history isolate database projects, selected repository and original actor before model context',async t=>{
  const keys=['NODE_ENV','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'],old=keys.map(k=>process.env[k]);
  Object.assign(process.env,{NODE_ENV:'test',SUPABASE_URL:'http://127.0.0.1:55439',SUPABASE_SERVICE_ROLE_KEY:'synthetic-only'});
  t.after(()=>keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];}));
  const owner=randomUUID(),foreign=randomUUID(),a=randomUUID(),b=randomUUID(),github=randomUUID(),repo='owned/repository';
  const context=createTenantContext({userId:owner,via:'remote_getuser'}),revision=randomUUID();
  const token=await sealRuntimeCredential(owner,{provider:'github',account:'github',credentialType:'oauth-token',recordId:'github',revision,scope:'github-connection'},'synthetic-owned-github');
  const projects=new Map<string,{id:string;user_id:string;github_repo_name:string|null}>([[a,{id:a,user_id:owner,github_repo_name:null}],[b,{id:b,user_id:owner,github_repo_name:null}],[github,{id:github,user_id:owner,github_repo_name:repo}]]);
  let mode='ok',remoteReads=0;
  const head='1'.repeat(40),tree='2'.repeat(40),memory=new Map<string,Record<string,unknown>>();
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    const url=new URL(String(input)),body=init?.body?JSON.parse(String(init.body)):{};
    if(url.origin==='https://api.github.com'){
      remoteReads++;assert.equal(new Headers(init?.headers).get('authorization'),'Bearer synthetic-owned-github');
      assert.ok(url.pathname.startsWith('/repos/'+repo));
      if(mode==='githubDenied')return Response.json({message:'Unavailable'},{status:404});
      if(url.pathname.endsWith('/git/ref/heads/main'))return Response.json({object:{sha:head}});
      if(url.pathname.endsWith('/git/commits/'+head))return Response.json({tree:{sha:tree}});
      if(url.pathname.endsWith('/git/trees/'+tree))return Response.json({sha:tree,truncated:false,tree:[{path:'src/a.ts',type:'blob',mode:'100644',sha:'3'.repeat(40)}]});
      assert.equal(url.pathname,'/repos/'+repo);return Response.json({size:1});
    }
    assert.equal(url.origin,process.env.SUPABASE_URL,'All external effects are controlled');
    const actor=url.searchParams.get('user_id')?.slice(3);
    if(url.pathname==='/rest/v1/projects'){
      assert.equal(actor,owner);const row=projects.get(url.searchParams.get('id')?.slice(3)??'');
      return Response.json(row?(mode==='foreignParent'?{...row,user_id:foreign}:row):null);
    }
    if(url.pathname==='/rest/v1/user_integrations')return Response.json(actor===owner&&url.searchParams.get('provider')==='eq.github'
      ?{user_id:owner,provider:'github',access_token:token,credential_revision:revision,metadata:{vault_revision:revision,vault_format:'github-oauth-v1'}}:[]);
    if(url.pathname==='/rest/v1/github_integrations')return Response.json({user_id:owner,access_token:token,repo_strategy:'auto',default_repo:repo});
    if(url.pathname==='/rest/v1/project_memory'){
      if(init?.method==='POST'){memory.set(String(body.repo),body);return Response.json(body);}
      return Response.json(memory.get(url.searchParams.get('repo')?.slice(3)??'')??null);
    }
    if(url.pathname==='/rest/v1/session_memory'){
      const selected=url.searchParams.get('repo')?.slice(3);assert.equal(actor,owner);
      return Response.json({user_id:mode==='foreignHistory'?foreign:owner,repo:selected,messages:[{role:'user',content:selected},{role:'system',content:'CONTROL_CANARY'}]});
    }
    assert.fail('Unexpected protocol '+url.pathname);
  });
  const scope=(projectId:string)=>({context,userId:owner,projectId});
  const files=(content:string)=>[{path:'src/a.ts',content}];
  for(const [id,content] of [[a,'owned project A'],[b,'owned project B']] as const){
    await setProjectMemoryDurable({userId:owner,repo:modelContextNamespace(id,null),files:files(content)});
    assert.deepEqual((await hydratePriorFiles(owner,undefined,scope(id))).files,files(content));
    assert.deepEqual(await loadSessionHistory(owner,modelContextNamespace(id,null)),[{role:'user',content:modelContextNamespace(id,null)}]);
  }
  const snapshot=await hydratePriorFiles(owner,undefined,scope(a));snapshot.files[0].content='foreign source';
  assert.deepEqual((await hydratePriorFiles(owner,undefined,scope(a))).files,files('owned project A'));
  await assert.rejects(hydratePriorFiles(foreign,undefined,scope(a)));
  mode='foreignParent';await assert.rejects(hydratePriorFiles(owner,undefined,scope(a)));mode='ok';
  mode='foreignHistory';assert.deepEqual(await loadSessionHistory(owner,modelContextNamespace(a,null)),[]);mode='ok';
  const fresh=randomUUID();projects.set(fresh,{id:fresh,user_id:owner,github_repo_name:null});
  await assert.rejects(hydratePriorFiles(owner,{buildUpdate:true},scope(fresh)),/no verified project binding/,'Unknown context must never become an empty update');
  await setProjectMemoryDurable({userId:owner,repo:null,files:files('UNBOUND_LOCAL_CANARY')});
  await assert.rejects(hydratePriorFiles(owner,{buildUpdate:true},scope(fresh)),/no verified project binding/);
  assert.deepEqual((await hydratePriorFiles(owner,{buildUpdate:false},scope(fresh))).files,[],'An explicit new build stays usable and cannot inherit legacy workspace files');
  assert.equal(getProjectMemory(owner,null)?.files[0].content,'UNBOUND_LOCAL_CANARY','Unsafe legacy namespace is retained, not guessed or deleted');
  await setProjectMemoryDurable({userId:owner,repo:modelContextNamespace(github,repo),files:files('owned repository source'),commitSha:head});
  const meta={githubTargetRepo:repo,githubTargetBranch:'main',priorSite:{html:'UNTRUSTED_BROWSER_CANARY'}};
  const result=await hydratePriorFiles(owner,meta,scope(github));assert.equal(result.source,'github-cache');assert.deepEqual(result.files,files('owned repository source'));assert.ok(remoteReads>=4);
  const before=remoteReads;await assert.rejects(hydratePriorFiles(owner,{...meta,githubTargetRepo:'foreign/repository'},scope(github)));assert.equal(remoteReads,before,'Wrong project repository fails before credentials or GitHub dispatch');
  mode='githubDenied';await assert.rejects(hydratePriorFiles(owner,meta,scope(github)),/not found or is not authorized/);
});
