import test from 'node:test';
import assert from 'node:assert/strict';
import {chatCompletion,chatCompletionStream} from './openaiCompat.js';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

test('only the three canonical production budget issuers can register generic SDK admissions',()=>{
  const root=new URL('../../../',import.meta.url);
  const files=execFileSync('git',['ls-files','backend/src'],{cwd:root,encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/);
  const producers:string[]=[];
  for(const file of files.filter(f=>f.endsWith('.ts')&&!/\.(test|integration)\.ts$/.test(f))){
    const ast=ts.createSourceFile(file,readFileSync(new URL(file,root),'utf8'),ts.ScriptTarget.Latest,true);
    for(const statement of ast.statements){
      if(!ts.isImportDeclaration(statement)||!ts.isStringLiteral(statement.moduleSpecifier)||!statement.moduleSpecifier.text.endsWith('/modelSdkAdmission.js'))continue;
      const bindings=statement.importClause?.namedBindings;
      assert.ok(bindings&&ts.isNamedImports(bindings),'Admission import cannot hide an unreviewed namespace issuer');
      if(bindings.elements.some(e=>(e.propertyName?.text??e.name.text)==='registerModelSdkAdmission'))producers.push(file);
    }
  }
  assert.deepEqual(producers.sort(),['backend/src/ai/providerBudget.ts','backend/src/ai/tenantModelDispatch.ts','backend/src/routes/guestChat.ts']);
});

for(const [id,invoke] of [['31380a8d5b9454a98a98',chatCompletion],['9c345e07b723c086440e',chatCompletionStream]] as const){
  test(`actual SDK ${id} refuses missing admission and a fabricated beforeDispatch callback before sending bytes`,async t=>{
    let sends=0;
    t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
      assert.equal(String(input),'https://open.bigmodel.cn/api/paas/v4/chat/completions');sends++;
      const body=JSON.parse(String(init?.body));
      if(body.stream)return new Response('data: '+JSON.stringify({id:'synthetic-only',choices:[{delta:{content:'synthetic completion'},finish_reason:'stop'}],usage:{prompt_tokens:2,completion_tokens:2}})+'\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
      return Response.json({id:'synthetic-only',choices:[{message:{content:'synthetic completion'},finish_reason:'stop'}],usage:{prompt_tokens:2,completion_tokens:2}});
    });
    for(const beforeDispatch of [undefined,async()=>{}]){
      await assert.rejects(invoke('glm_5_3_flash',[{role:'user',content:'synthetic owned text'}],
        {maxTokens:8,credentialOverride:'synthetic-test-key',beforeDispatch}),{code:'MODEL_DISPATCH_BINDING_DENIED'});
      assert.equal(sends,0,'A function-shaped input cannot issue tenant identity, budget or credential authority');
    }
  });
}
