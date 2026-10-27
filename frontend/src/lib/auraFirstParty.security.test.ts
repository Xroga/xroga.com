import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {readFileSync} from 'node:fs';import vm from 'node:vm';import ts from 'typescript';

/** Execute the actual component's transport handlers with controlled React hooks.
 * HTTP/redirects/body reads remain real. This is not a DOM or live-model test.
 */
function component(origin:string){
 const states:any[]=[],effects:Array<()=>unknown>=[],pending:Promise<Response>[]=[];let cursor=0,mounted=false;
 const useState=(initial:any)=>{const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],(value:any)=>{states[i]=typeof value==='function'?value(states[i]):value;}];};
 const react={useState,useRef:(value:any)=>useState({current:value})[0],useMemo:(fn:()=>unknown)=>fn(),useEffect:(fn:()=>unknown)=>{if(!mounted)effects.push(fn);}};
 const jsx=(type:any,props:any)=>({type,props});const exports:any={};
 const source=readFileSync(new URL('../components/showcase/products/AiSaas.tsx',import.meta.url),'utf8');
 const marker='  const relativeHistory = useMemo';assert.equal(source.split(marker).length,2);
 const instrumented=source.replace(marker,'  globalThis.__auraSend=sendMessage;globalThis.__auraView={configured,generating,error,conversations};\n'+marker);
 const code=ts.transpileModule(instrumented,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const context:any={exports,require:(id:string)=>{if(id==='react')return react;if(id==='react/jsx-runtime')return{jsx,jsxs:jsx,Fragment:'fragment'};if(id==='./shared')return{productReset:()=>''};throw new Error('Unexpected component dependency '+id);},
  AbortController,AbortSignal,DOMException,TextDecoder,TextEncoder,Response,Headers,URL,console,setTimeout,clearTimeout,
  fetch:(path:string,init?:RequestInit)=>{assert.ok(['/api/showcase/aura/health','/api/showcase/aura/chat'].includes(path));const p=fetch(origin+path,init);pending.push(p);return p;}};
 vm.runInNewContext(code,context,{filename:'actual-AiSaas.tsx',timeout:1000});
 const render=()=>{cursor=0;exports.AiSaas();mounted=true;return context.__auraView;};render();
 return{health:async()=>{const cleanup=effects[0]();await Promise.allSettled(pending);for(let i=0;i<50&&render().configured===null;i++)await new Promise(r=>setTimeout(r,10));assert.notEqual(render().configured,null,'Health handler must settle');return{view:render(),cleanup};},send:async(text:string)=>{await context.__auraSend(text);return render();}};
}

test('Aura manual-input frontend callers cannot forward redirects or accept unbounded receipts',async t=>{
 let mode='ok',outside=0,forwardedBody='',requests=0;
 const sink=createServer(async(req,res)=>{outside++;for await(const chunk of req)forwardedBody+=String(chunk);res.writeHead(200,{'content-type':'text/event-stream'}).end('data: {"choices":[{"delta":{"content":"foreign response"}}]}\n\n');});
 await new Promise<void>(r=>sink.listen(0,'127.0.0.1',r));const sinkAddress=sink.address();assert.ok(sinkAddress&&typeof sinkAddress!=='string');
 const server=createServer((req,res)=>{requests++;if(mode==='redirect'){res.writeHead(307,{location:`http://127.0.0.1:${sinkAddress.port}/collect`}).end();return;}
  if(req.url?.endsWith('/health')){res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({configured:true,...(mode==='large'?{padding:'x'.repeat(65537)}:{})}));return;}
  if(mode==='unavailable'){res.writeHead(503,{'content-type':'application/json'}).end(JSON.stringify({error:'Public demo is unavailable.'}));return;}
  res.writeHead(200,{'content-type':'text/event-stream'}).end('data: '+JSON.stringify({choices:[{delta:{content:mode==='large'?'x'.repeat(1048577):'Authorized first-party reply'}}]})+'\n\ndata: [DONE]\n\n');
 });await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();assert.ok(address&&typeof address!=='string');const origin=`http://127.0.0.1:${address.port}`;
 t.after(async()=>{for(const s of[server,sink])s.closeAllConnections();await Promise.all([server,sink].map(s=>new Promise<void>(r=>s.close(()=>r()))));});
 await t.test('health redirect is refused before following',async()=>{mode='redirect';outside=0;const result=await component(origin).health();if(typeof result.cleanup==='function')result.cleanup();assert.equal(outside,0);assert.equal(result.view.configured,false);});
 await t.test('chat redirect never forwards the private manual conversation',async()=>{mode='redirect';outside=0;forwardedBody='';const view=await component(origin).send('PRIVATE_OWNED_MANUAL_CONVERSATION_CANARY');assert.equal(outside,0);assert.equal(forwardedBody,'');assert.ok(view.error);});
 await t.test('oversized health receipt cannot advertise ready status',async()=>{mode='large';const result=await component(origin).health();if(typeof result.cleanup==='function')result.cleanup();assert.equal(result.view.configured,false);});
 await t.test('oversized chat stream is stopped and cannot become successful output',async()=>{mode='large';const view=await component(origin).send('manual fixture');assert.ok(view.error);assert.equal(view.generating,false);assert.equal(view.conversations[0].messages.filter((m:any)=>m.role==='assistant').length,0);});
 await t.test('ordinary first-party outage and later authorized manual request remain functional',async()=>{mode='unavailable';let view=await component(origin).send('manual fixture');assert.ok(view.error);mode='ok';view=await component(origin).send('manual fixture');assert.equal(view.error,null);assert.equal(view.conversations[0].messages.at(-1).content,'Authorized first-party reply');assert.ok(requests>0);});
});
