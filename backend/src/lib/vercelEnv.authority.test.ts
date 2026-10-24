import assert from 'node:assert/strict';
import { test } from 'node:test';
import { syncEnvVarsToVercelProject } from './vercelEnv.js';

test('vault environment sync preserves exact targets and fails closed before ambiguous writes', async t => {
  const projectName = `project_${'a'.repeat(60)}.live`;
  let mode = 'ok';
  const calls: Array<{url:string;method:string;body:unknown}> = [];
  const opts = { token:'TOKEN_PRIVATE_CANARY', projectName, env:{API_KEY:'VALUE_PRIVATE_CANARY'} };
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    const url=String(input),method=init?.method??'GET';
    calls.push({url,method,body:init?.body?JSON.parse(String(init.body)):null});
    assert.ok(url.startsWith('https://api.vercel.com/'));
    if(mode==='throw')throw new Error('TOKEN_PRIVATE_CANARY VALUE_PRIVATE_CANARY request dump');
    if(url.includes(`/projects/${projectName}`)){
      if(['401','403','429','500','404'].includes(mode))return Response.json({}, {status:Number(mode)});
      if(mode==='foreign')return Response.json({id:'prj_owner',name:'foreign'});
      if(mode==='bad-id')return Response.json({id:'../foreign',name:projectName});
      if(mode==='missing')return Response.json({name:projectName});
      if(mode==='snapshot'){opts.env.API_KEY='MUTATED';opts.token='MUTATED';}
      return Response.json({id:'prj_owner',name:projectName});
    }
    if(url.endsWith('/v10/projects'))return Response.json({id:'prj_owner',name:projectName});
    if(method==='GET'){
      if(mode==='list-outage')return Response.json({}, {status:503});
      if(mode==='list-malformed')return Response.json({});
      if(mode==='list-duplicate')return Response.json({envs:[{id:'one',key:'API_KEY'},{id:'two',key:'API_KEY'}]});
      if(mode==='list-bad-id')return Response.json({envs:[{id:'../foreign',key:'API_KEY'}]});
      return Response.json({envs:mode==='patch-denied'?[{id:'env_id',key:'API_KEY'}]:[]});
    }
    const body=JSON.parse(String(init?.body));
    const receipt={id:'env_id',key:body.key??'API_KEY',type:'encrypted',target:['production','preview','development'],value:'opaque-provider-value'};
    return Response.json(method==='PATCH'?receipt:{created:receipt,failed:[]}, {status:mode==='patch-denied'?403:200});
  });
  for(mode of ['ok','404','snapshot']){
    calls.length=0;opts.env.API_KEY='VALUE_PRIVATE_CANARY';opts.token='TOKEN_PRIVATE_CANARY';
    const result=await syncEnvVarsToVercelProject(opts);
    assert.equal(result.ok,true);assert.equal(result.projectName,projectName);
    assert.equal(calls[0].url,`https://api.vercel.com/v9/projects/${projectName}`);
    const write=calls.find(call=>call.method==='POST'&&call.url.includes('/env'))!;
    assert.equal((write.body as {value:string}).value,'VALUE_PRIVATE_CANARY');
    assert.equal(calls.filter(call=>call.url.endsWith('/v10/projects')).length,mode==='404'?1:0);
  }
  for(mode of ['401','403','429','500','foreign','bad-id','missing','list-outage','list-malformed','list-duplicate','list-bad-id','throw']){
    calls.length=0;
    const result=await syncEnvVarsToVercelProject(opts);
    assert.equal(result.ok,false);assert.ok(calls.every(call=>call.method==='GET'));
    assert.doesNotMatch(JSON.stringify(result),/PRIVATE_CANARY|request dump/);
  }
  mode='patch-denied';calls.length=0;
  assert.equal((await syncEnvVarsToVercelProject(opts)).ok,false);
  assert.equal(calls.filter(call=>call.method==='PATCH').length,1);
  assert.equal(calls.filter(call=>call.method==='POST').length,0);
  for(const name of ['UpperCase','with space','a---b','a'.repeat(101),'../other']){
    calls.length=0;assert.equal((await syncEnvVarsToVercelProject({...opts,projectName:name})).ok,false);assert.equal(calls.length,0);
  }
});

test('environment writes require matching provider receipts and retain verified partial results',async t=>{
  let mode='ok',writes=0;
  const expected={id:'env_one',key:'FIRST',type:'encrypted',target:['development','production','preview'],value:'opaque'};
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    const url=String(input);
    if(!url.includes('/env'))return Response.json({id:'prj_owner',name:'exact-project'});
    if(!init?.method)return Response.json({envs:mode.startsWith('patch')?[{id:'env_one',key:'FIRST'}]:[]});
    writes++;
    if(writes===2)throw new Error('PRIVATE_REQUEST_DUMP');
    let row:unknown=expected;
    if(mode==='wrong-key')row={...expected,key:'FOREIGN'};
    if(mode==='wrong-target')row={...expected,target:['preview']};
    if(mode==='plain')row={...expected,type:'plain'};
    if(mode==='branch')row={...expected,gitBranch:'foreign'};
    if(mode==='config')row={...expected,visibility:'config'};
    if(mode==='patch-wrong-id')row={...expected,id:'foreign'};
    if(mode==='missing')row=null;
    if(mode==='malformed')return new Response('not-json');
    if(init.method==='PATCH')return Response.json(row);
    return Response.json({created:mode==='array'?[row]:row,failed:mode==='failed'?[{error:{message:'PRIVATE_REQUEST_DUMP'}}]:[]});
  });
  for(mode of ['ok','array','patch-ok']){
    writes=0;const result=await syncEnvVarsToVercelProject({token:'synthetic',projectName:'exact-project',env:{FIRST:'private',SECOND:'private',THIRD:'private'}});
    assert.equal(result.ok,false);assert.deepEqual(result.upserted,['FIRST']);assert.deepEqual(result.skipped,['SECOND','THIRD']);assert.equal(writes,2);
    assert.doesNotMatch(JSON.stringify(result),/PRIVATE_REQUEST_DUMP/);
  }
  for(mode of ['wrong-key','wrong-target','plain','branch','config','patch-wrong-id','missing','malformed','failed']){
    writes=0;const result=await syncEnvVarsToVercelProject({token:'synthetic',projectName:'exact-project',env:{FIRST:'private'}});
    assert.equal(result.ok,false);assert.deepEqual(result.upserted,[]);assert.deepEqual(result.skipped,['FIRST']);assert.equal(writes,1);
    assert.doesNotMatch(JSON.stringify(result),/PRIVATE_REQUEST_DUMP/);
  }
});
