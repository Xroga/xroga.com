import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const read=(path:string)=>readFileSync(resolve(root,path),'utf8');
function tree(path:string){return ts.createSourceFile(path,read(path),ts.ScriptTarget.Latest,true,path.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);}
function nodes<T extends ts.Node>(ast:ts.Node,predicate:(node:ts.Node)=>node is T):T[]{const result:T[]=[];const visit=(n:ts.Node)=>{if(predicate(n))result.push(n);ts.forEachChild(n,visit);};visit(ast);return result;}
const compile=(source:string)=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;

test('Workforce send candidates are local reducer events, not external dispatch',()=>{
  const path='frontend/src/components/homepage-next/s02/WorkforceStage.tsx',ast=tree(path);
  const bindings=nodes(ast,ts.isVariableDeclaration).filter(n=>n.name.getText(ast)==='send');assert.equal(bindings.length,1);
  const events:unknown[]=[];const send=vm.runInNewContext(compile('const send='+bindings[0].initializer!.getText(ast)+';send;'),{id:'synthetic',dispatch:(event:unknown)=>events.push(event)});
  send('owned local text');send();assert.equal(events.length,2);assert.equal((events[0] as any).type,'send');
  assert.equal(nodes(ast,ts.isCallExpression).filter(n=>n.expression.getText(ast)==='send').length,2);
  assert.match(read('frontend/src/components/homepage-next/s02/S02Work.tsx'),/useReducer\(workforceReducer, undefined, initialWorkforce\)/);
  assert.match(read('frontend/src/components/homepage-next/s02/Theater.tsx'),/<Workforce wf=\{wf\} dispatch=\{wfDispatch\}/);
  assert.doesNotMatch(read(path),/\bfetch\s*\(|new WebSocket|axios\./);
  assert.doesNotMatch(read('frontend/src/components/homepage-next/s02/workforce.ts'),/\bfetch\s*\(|new WebSocket|axios\./);
});
test('profile image decoder fetches only data images and never fetches supplied HTTP URLs',async()=>{
  const exports:any={},fetches:string[]=[],saved:string[]=[],uploads:File[]=[];
  vm.runInNewContext(compile(read('frontend/src/lib/setProfileFromImage.ts')),{exports,File,fetch:async(url:string)=>{fetches.push(url);assert.match(url,/^data:image\//);return fetch(url);}});
  const api={setAvatarUrl:async(url:string)=>{saved.push(url);},uploadAvatarFile:async(file:File)=>{uploads.push(file);}};
  await exports.setProfileFromImageUrl('https://user-chosen.example/avatar.png',api);assert.equal(fetches.length,0);assert.equal(saved.length,1);
  await exports.setProfileFromImageUrl('data:image/png;base64,aGVsbG8=',api);assert.equal(fetches.length,1);assert.equal(uploads.length,1);
  await assert.rejects(exports.setProfileFromImageUrl('file:///private',api));assert.equal(fetches.length,1);
});
test('clipboard image candidate receives only task-owned local blob URLs',async()=>{
  const path='frontend/src/components/terminal/ChatBarFileGrid.tsx',ast=tree(path);
  const copy=nodes(ast,ts.isFunctionDeclaration).filter(n=>n.name?.text==='copyImage');assert.equal(copy.length,1);
  const setters=nodes(ast,ts.isCallExpression).filter(n=>n.expression.getText(ast)==='setUrls');assert.equal(setters.length,1);assert.equal(setters[0].arguments[0].getText(ast),'next');
  assert.match(read(path),/next\[i\] = URL\.createObjectURL\(f\)/);assert.match(read(path),/url=\{urls\[previewIdx\] \?\? null\}/);assert.match(read(path),/URL\.revokeObjectURL\(u\)/);
  const url=URL.createObjectURL(new Blob(['synthetic image'],{type:'image/png'})),copied:unknown[]=[];
  try{
    const fn=vm.runInNewContext(compile(copy[0].getText(ast)+';copyImage;'),{url,isImage:true,fetch:async(target:string)=>{assert.equal(target,url);return fetch(target);},
      navigator:{clipboard:{write:async(value:unknown)=>{copied.push(value);}}},ClipboardItem:class{constructor(readonly data:unknown){}},toast:{success(){},error(){}}});
    await fn();assert.equal(copied.length,1);
  }finally{URL.revokeObjectURL(url);}
});
test('native GCE verification metadata caller is gated off before transport in normal production',()=>{
  const path='backend/src/scripts/verifyGceExecution.ts',ast=tree(path),block=ast.statements.find(ts.isTryStatement)!.tryBlock;
  const guard=block.statements.find(ts.isIfStatement)!;assert.match(guard.getText(ast),/EXPLICIT_PRIVATE_VERIFICATION_JOB_REQUIRED/);
  const fetchCall=nodes(block,ts.isCallExpression).find(n=>n.expression.getText(ast)==='fetch')!;assert.ok(guard.end<fetchCall.getStart(ast));
  for(const env of [{},{CLOUD_RUN_JOB:'xroga-canonical-production'},{XROGA_GCE_VERIFY_ONLY:'synthetic_native_transport'}])assert.throws(()=>vm.runInNewContext(guard.getText(ast),{process:{env}}),/EXPLICIT_PRIVATE_VERIFICATION_JOB_REQUIRED/);
  const files=execFileSync('git',['ls-files','backend/src','frontend/src'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(p=>/\.[jt]sx?$/.test(p)&&!p.includes('.test.')&&!p.includes('.integration.')&&p!==path);
  const importers:string[]=[];
  for(const file of files){const source=read(file);if(!source.includes('verifyGceExecution'))continue;const parsed=tree(file);
    for(const specifier of nodes(parsed,ts.isStringLiteral))if(specifier.text.includes('verifyGceExecution')&&(ts.isImportDeclaration(specifier.parent)||ts.isExportDeclaration(specifier.parent)||ts.isCallExpression(specifier.parent)))importers.push(file);
  }
  assert.deepEqual(importers,[],'No production caller may import or dynamically load this operator-only program');
});
test('development API health banner has no production transport',()=>{
  const ast=tree('frontend/src/components/dashboard/ApiConnectionBanner.tsx');
  const effect=nodes(ast,ts.isCallExpression).find(n=>n.expression.getText(ast)==='useEffect')!.arguments[0];let requests=0;
  const callback=vm.runInNewContext(compile('const effect='+effect.getText(ast)+';effect;'),{process:{env:{NODE_ENV:'production'}},fetch:()=>{requests++;throw Error('Unexpected production health request');}});
  callback();assert.equal(requests,0);
});
test('currency display reads only the fixed same-origin public country endpoint',async()=>{
  let state:any;const requests:Array<{url:string;options:unknown}>=[];const exports:any={};
  vm.runInNewContext(compile(read('frontend/src/store/useCurrencyStore.ts')),{exports,require:(id:string)=>{
    if(id==='zustand')return{create:()=>((initialize:any)=>{state=initialize((next:any)=>Object.assign(state,next),()=>state);return state;})};
    if(id==='zustand/middleware')return{persist:(initialize:any)=>initialize};
    if(id==='@/lib/currency')return{currencyForCountry:()=> 'PKR',isUsdRegion:()=>false};
    throw Error('Unexpected currency fixture dependency');
  },fetch:async(url:string,options:unknown)=>{requests.push({url,options});assert.equal(url,'/api/geo');return Response.json({country:'PK',blocked:false});}});
  await exports.useCurrencyStore.detect();await exports.useCurrencyStore.detect();
  assert.equal(requests.length,1);assert.equal(requests[0].options,undefined,'No user payload, Authorization header or externally selected destination');
  assert.equal(state.country,'PK');assert.equal(state.loaded,true);
  assert.doesNotMatch(read('frontend/src/app/api/geo/route.ts'),/\bfetch\s*\(|new WebSocket|axios\./);
});
