import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {getProjectMemory,getProjectMemoryAsync,setProjectMemory,setProjectMemoryDurable} from './projectMemory.js';
import {loadSessionHistory} from './sessionMemory.js';

test('project and session reads reject foreign lineage and a cold read cannot overwrite newer memory',async()=>{
  const prior=[process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY],originalFetch=globalThis.fetch;
  process.env.SUPABASE_URL='http://127.0.0.1:49228';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-only';
  const userId=randomUUID(),repo='owner/repo',branch='main';
  let row:Record<string,unknown>={user_id:userId,repo,branch,files:[{path:'a.txt',content:'old'}],paths:['a.txt'],updated_at:new Date().toISOString()};
  let messages:Record<string,unknown>={user_id:userId,repo,messages:[{role:'user',content:'safe'},{role:'system',content:'UNTRUSTED_SYSTEM'},{role:'arbitrary',content:'INVALID_ROLE'}]};
  let hold=false,release:(()=>void)|undefined;
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input));assert.equal(url.origin,process.env.SUPABASE_URL);
    if(url.pathname==='/rest/v1/user_integrations')return Response.json([]);
    if(url.pathname.startsWith('/storage/v1/'))return Response.json({statusCode:'404',message:'Synthetic missing credential'},{status:404});
    if(url.pathname==='/rest/v1/session_memory'){assert.equal(url.searchParams.get('user_id'),`eq.${userId}`);assert.equal(url.searchParams.get('repo'),`eq.${repo}`);return Response.json(messages);}
    assert.equal(url.pathname,'/rest/v1/project_memory');
    if(init?.method==='POST')return new Response(null,{status:201});
    assert.equal(url.searchParams.get('user_id'),`eq.${userId}`);assert.equal(url.searchParams.get('repo'),`eq.${repo}`);assert.equal(url.searchParams.get('branch'),`eq.${branch}`);
    const snapshot=structuredClone(row);if(hold)await new Promise<void>(resolve=>{release=resolve;});return Response.json(snapshot);
  };
  try{
    const valid=structuredClone(row);
    for(const patch of [{user_id:randomUUID()},{repo:'foreign/repo'},{branch:'foreign'},{files:[{path:'a',content:42}]}]){
      row={...valid,...patch};assert.equal(await getProjectMemoryAsync(userId,repo,branch),null);
    }
    row=valid;hold=true;
    const cold=getProjectMemoryAsync(userId,repo,branch);while(!release)await new Promise(resolve=>setImmediate(resolve));
    const saved=await setProjectMemoryDurable({userId,repo,branch,files:[{path:'new.txt',content:'newer'}],commitSha:null});
    saved.memory.files[0].content='caller mutated returned memory';
    release();const actual=await cold;assert.equal(actual?.files[0].content,'newer');
    actual!.files[0].content='caller mutated loaded memory';
    assert.equal(getProjectMemory(userId,repo,branch)?.files[0].content,'newer');
    assert.deepEqual(await loadSessionHistory(userId,repo),[{role:'user',content:'safe'}]);
    messages={...messages,user_id:randomUUID()};assert.deepEqual(await loadSessionHistory(userId,repo),[]);
    messages={...messages,user_id:userId,repo:'foreign/repo'};assert.deepEqual(await loadSessionHistory(userId,repo),[]);
  }finally{release?.();globalThis.fetch=originalFetch;['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'].forEach((key,index)=>{if(prior[index]===undefined)delete process.env[key];else process.env[key]=prior[index];});}
});

test('background project-memory persistence snapshots before credential resolution and redacts failures',async t=>{
  const prior=[process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY],originalFetch=globalThis.fetch;
  process.env.SUPABASE_URL='http://127.0.0.1:49229';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-only';
  const userId=randomUUID(),repo='owner/original';let release:(()=>void)|undefined,arrived:(()=>void)|undefined;
  let payload:Record<string,unknown>|undefined;const logs:unknown[][]=[];t.mock.method(console,'warn',(...args:unknown[])=>{logs.push(args);});
  const written=new Promise<void>(resolve=>{arrived=resolve;});
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input));
    if(url.pathname==='/rest/v1/user_integrations'){if(!release)await new Promise<void>(resolve=>{release=resolve;});return Response.json([]);}
    if(url.pathname.startsWith('/storage/v1/'))return Response.json({statusCode:'404',message:'Synthetic missing credential'},{status:404});
    assert.equal(url.pathname,'/rest/v1/project_memory');assert.equal(init?.method,'POST');payload=JSON.parse(String(init?.body));arrived!();
    return Response.json({message:'SECRET_PROVIDER_DIAGNOSTIC_CANARY'},{status:400});
  };
  try{
    const memory=setProjectMemory({userId,repo,branch:'main',files:[{path:'original.txt',content:'original'}]});
    while(!release)await new Promise(resolve=>setImmediate(resolve));
    memory.userId=randomUUID();memory.repo='foreign/repo';memory.files[0].content='tampered';memory.paths.push('foreign.txt');
    release();await written;
    assert.equal(payload?.user_id,userId);assert.equal(payload?.repo,repo);assert.deepEqual(payload?.files,[{path:'original.txt',content:'original'}]);assert.deepEqual(payload?.paths,['original.txt']);
    // Drain the rejected background write's catch without claiming durable success.
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(logs,[['[projectMemory] background save unavailable']]);
    assert.ok(!JSON.stringify(logs).includes('SECRET_PROVIDER_DIAGNOSTIC_CANARY'));
  }finally{release?.();globalThis.fetch=originalFetch;['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'].forEach((key,index)=>{if(prior[index]===undefined)delete process.env[key];else process.env[key]=prior[index];});}
});
