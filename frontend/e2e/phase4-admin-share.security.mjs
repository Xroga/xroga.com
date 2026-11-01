import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(new URL('../../package.json',import.meta.url)),ts=require('typescript');
function guard(origin){
  const source=readFileSync(new URL('../src/lib/api.ts',import.meta.url),'utf8'),ast=ts.createSourceFile('api.ts',source,ts.ScriptTarget.Latest,true);
  const declarations=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='fetchApiResponse'||ts.isClassDeclaration(n)&&n.name?.text==='ApiError');assert.equal(declarations.length,2);
  const exports={};vm.runInNewContext(ts.transpileModule(`const API_URL=${JSON.stringify(origin)};\n`+declarations.map(n=>n.getText(ast)).join('\n'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,URL,fetch,DOMException});
  return{...exports,API_URL:origin};
}
function fixture(origin,authenticated=true){
  const api=guard(origin),states=[];let load;
  const session={access_token:'synthetic-admin-session'};
  const client={createClient:async()=>({auth:{getSession:async()=>({data:{session}}),getUser:async()=>({data:{user:authenticated?{id:'11111111-1111-4111-8111-111111111111'}:null},error:null})}})};
  const common={'@/lib/api':api,'@/lib/supabase/client':{createClient:()=>({auth:{getSession:async()=>({data:{session}})}})},'@/lib/supabase/server':client,
    'react':{cache:f=>f,useState:value=>{const i=states.length;states.push(value);return[value,v=>{states[i]=v;}];},useCallback:f=>(load=f),useEffect(){}},
    'react/jsx-runtime':{jsx:()=>null,jsxs:()=>null},'next/navigation':{notFound(){throw Error('missing');}},'next/image':{},'next/link':{},'@/components/terminal/SharedAnswerDownloads':{},'next/server':{NextResponse:{json:Response.json}}};
  function compile(path,suffix=''){
    const exports={},code=ts.transpileModule(readFileSync(new URL('../src/'+path,import.meta.url),'utf8')+suffix,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    vm.runInNewContext(code,{exports,require:id=>{if(!(id in common))throw Error('Unexpected fixture dependency '+id);return common[id];},fetch,URL,URLSearchParams,AbortSignal,Buffer,Response,Headers,console,process:{env:{NEXT_PUBLIC_API_URL:origin,NODE_ENV:'test'}}});return exports;
  }
  const admin=compile('app/(shell)/admin/AdminPageClient.tsx');admin.default();
  const share=compile('app/share/[token]/page.tsx','\nexport {loadShare};');
  const privateFile=compile('app/api/private-files/[projectId]/[fileId]/route.ts');
  return{loadAdmin:()=>load(),states,loadShare:share.loadShare,loadPrivate:(query='')=>privateFile.GET(new Request('https://xroga.com/api/private-files/a/b'+query,{headers:{range:'bytes=0-2'}}),{params:Promise.resolve({projectId:'11111111-1111-4111-8111-111111111111',fileId:'22222222-2222-4222-8222-222222222222'})})};
}
const token='synthetic_share_token_12345';
test('actual admin callbacks and shared-answer loader stop API redirects without alternate requests',async t=>{
  let forwarded=0;
  const sink=createServer((_req,res)=>{forwarded++;res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({errors:[],share:{token,visibility:'public',scope:'response',prompt:'owned',response:'owned'}}));});
  const api=createServer((_req,res)=>res.writeHead(307,{location:`http://127.0.0.1:${sink.address().port}/collect`}).end());
  await new Promise(r=>sink.listen(0,'127.0.0.1',r));await new Promise(r=>api.listen(0,'127.0.0.1',r));
  try{for(const name of ['admin','share','private-file'])await t.test(name,async()=>{
    forwarded=0;const f=fixture(`http://127.0.0.1:${api.address().port}`);
    const result=name==='admin'?await f.loadAdmin():name==='share'?await f.loadShare(token):await f.loadPrivate();
    assert.equal(forwarded,0,'No redirected admin or share request');
    if(name==='admin')assert.equal(f.states[4],'System error records request failed');
    else assert.equal(result.status,name==='share'?'missing':503);
  });}finally{api.closeAllConnections();sink.closeAllConnections();await Promise.all([new Promise(r=>api.close(r)),new Promise(r=>sink.close(r))]);}
});

test('authorized admin, bounded shares and private range delivery keep their contracts and denial results stay private',async()=>{
  let mode='positive',requests=0,auth='';
  const share={token,visibility:'public',scope:'response',prompt:'owned prompt',response:'owned answer'};
  const api=createServer((req,res)=>{
    requests++;auth=req.headers.authorization;
    if(mode==='403'){res.writeHead(403).end('PRIVATE_PROVIDER_ERROR_CANARY');return;}
    if(req.url.includes('/message-shares/')){res.writeHead(200,{'content-type':'application/json'}).end(mode==='oversized'?'x'.repeat(1024*1024+1):JSON.stringify({share:{...share,...(mode==='wrong-share'?{token:'other_token_1234567890'}:{})}}));return;}
    if(req.url.includes('/files/')){assert.equal(req.headers.range,'bytes=0-2');res.writeHead(206,{'content-type':'application/octet-stream','content-range':'bytes 0-2/3','content-length':'3','set-cookie':'unexpected-cookie=do-not-forward','x-untrusted-header':'do-not-forward'}).end('abc');return;}
    res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({errors:[],readiness:{status:'verified',checks:[],blockers:[]}}));
  });await new Promise(r=>api.listen(0,'127.0.0.1',r));
  try{
    const origin=`http://127.0.0.1:${api.address().port}`,f=fixture(origin);
    await f.loadAdmin();assert.equal(f.states[4],null);assert.equal(f.states[5].status,'verified');assert.equal(auth,'Bearer synthetic-admin-session');
    assert.equal((await f.loadShare(token)).status,'ok');
    const delivered=await f.loadPrivate('?link=synthetic-owner-link');assert.equal(delivered.status,206);assert.equal(await delivered.text(),'abc');assert.equal(delivered.headers.get('set-cookie'),null);assert.equal(delivered.headers.get('x-untrusted-header'),null);assert.equal(delivered.headers.get('cache-control'),'private, no-store');
    requests=0;assert.equal((await fixture(origin,false).loadPrivate()).status,401);assert.equal(requests,0);
    assert.equal((await f.loadPrivate('?link=one&link=two')).status,404);assert.equal(requests,0);
    for(mode of ['wrong-share','oversized'])assert.equal((await f.loadShare(token)).status,'missing');
    mode='403';assert.equal((await f.loadShare(token)).status,'private');const denied=await f.loadPrivate();assert.equal(denied.status,503);assert.ok(!(await denied.text()).includes('PRIVATE_PROVIDER_ERROR_CANARY'));
  }finally{api.closeAllConnections();await new Promise(r=>api.close(r));}
});
