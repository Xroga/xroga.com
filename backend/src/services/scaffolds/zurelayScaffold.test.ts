import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import {buildAgentFeatureFiles} from './featurePacks.js';
import {buildNextjsScaffold} from './nextjsScaffold.js';

test('generated application templates use only exact Zurelay and reject empty, truncated or substituted responses without a replay',async()=>{
  const agent=buildAgentFeatureFiles('offline').find(f=>f.path==='lib/agent/runner.ts')!;
  const chat=buildNextjsScaffold({projectName:'Offline'}).find(f=>f.path==='app/api/chat/route.ts')!;
  for(const file of [agent,chat]){
    let calls=0,mode='valid';
    const exports:Record<string,any>={};
    const source=ts.transpileModule(file.content,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const sandbox={exports,Request,Response,process:{env:{ZURELAY_API_KEY:'synthetic-private-key'}},
      require:(name:string)=>{assert.equal(name,'next/server');return {NextResponse:{json:Response.json}};},
      fetch:async(url:string,init:RequestInit)=>{
        calls++;assert.equal(url,'https://api.zurelay.com/v1/chat/completions');assert.equal(init.redirect,'error');
        assert.equal(new Headers(init.headers).get('x-zurelay-fallback'),'off');
        const body=JSON.parse(String(init.body));assert.equal(body.model,'deepseek-v4.1-flash-1017');assert.ok(body.max_tokens>0);assert.equal(body.models,undefined);
        return Response.json({model:mode==='substituted'?'other':body.model,usage:{prompt_tokens:4,completion_tokens:3,total_tokens:7},
          choices:[{message:{content:mode==='empty'?'':'Synthetic output'},finish_reason:mode==='truncated'?'length':'stop'}]},
          {headers:{'x-request-id':'synthetic-request','x-zurelay-model':body.model}});
      }};
    vm.runInNewContext(source,sandbox,{filename:file.path,timeout:1000});
    const run=async()=>file===agent?exports.runAgentOnce({goal:'Offline fixture'}):exports.POST(new Request('https://synthetic.invalid/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Offline fixture'})}));
    for(mode of ['valid','empty','truncated','substituted']){
      const before=calls,result=await run();assert.equal(calls,before+1);
      if(file===agent)assert.equal(result.ok,mode==='valid');else assert.equal(result.status,mode==='valid'?200:502);
      const text=file===agent?JSON.stringify(result):await result.text();assert.doesNotMatch(text,/synthetic-private-key/);
    }
    sandbox.process.env.ZURELAY_API_KEY='';const before=calls,result=await run();assert.equal(calls,before);
    if(file===agent)assert.equal(result.ok,false);else assert.equal(result.status,503);
  }
});
