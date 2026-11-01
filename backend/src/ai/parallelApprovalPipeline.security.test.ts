import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
test('actual build pipeline never labels pending research approval as verified evidence',()=>{
 const text=readFileSync(new URL('./pipeline.ts',import.meta.url),'utf8'),anchor=text.indexOf('  let researchState: ResearchTodoState'),start=text.indexOf('      research = web.bundle;',anchor),end=text.indexOf('    } catch (error)',start);assert.ok(start>anchor&&end>start);
 const script=ts.transpileModule(`globalThis.run=()=>{${text.slice(start,end)};return{research,researchBlock,researchState};}`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 for(const mode of ['pending','verified','none','unavailable']){
  const events:Array<{status:string;message:string}>=[],url='/dashboard/actions/confirm/11111111-1111-4111-8111-111111111111';
  const context:Record<string,unknown>={research:null,researchBlock:'',researchState:'active',web:{action:mode==='none'?'none':'search',bundle:mode==='verified'?{sources:[{url:'https://example.com'}]}:null,evidence:mode==='unavailable'?'':'Research awaits approval',sourceCount:mode==='verified'?1:0,needsConfirmation:mode==='pending',reviewUrl:url},emit:(v:{status:string;message:string})=>events.push(v),todos:()=>[]};
  vm.runInNewContext(script,context);const result=(context.run as()=>{researchState:string;researchBlock:string})();
  assert.equal(result.researchState,mode==='pending'?'pending':mode==='verified'?'done':'skipped');
  if(mode==='pending'){assert.equal(result.researchBlock,'');assert.ok(events.some(e=>e.status==='confirmation_required'&&e.message.includes(url)));assert.ok(!events.some(e=>e.status==='ready'));}
 }
});
