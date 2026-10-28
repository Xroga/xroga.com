import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';

test('separate API instances with the same Cloud Run revision and PID cannot share browser lease ownership',()=>{
  const text=readFileSync(new URL('./browserRuns.ts',import.meta.url),'utf8');
  const source=ts.createSourceFile('browserRuns.ts',text,ts.ScriptTarget.Latest,true);
  const expressions:ts.Expression[]=[];
  const factory=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='productionDeps');assert.ok(factory);
  const visit=(node:ts.Node)=>{if(ts.isPropertyAssignment(node)&&node.name.getText(source)==='workerId')expressions.push(node.initializer);ts.forEachChild(node,visit);};visit(factory);
  assert.equal(expressions.length,1,'Inspect the actual cached production factory identity');
  const ids=Array.from({length:4},()=>runInNewContext(expressions[0].getText(source),
    {process:{pid:1,env:{NODE_ENV:'production',K_REVISION:'synthetic-shared-revision'}},randomUUID},{timeout:100}));
  assert.equal(new Set(ids).size,ids.length,'A revision or process ID is shared across replicas and cannot own a fenced lease');
});
