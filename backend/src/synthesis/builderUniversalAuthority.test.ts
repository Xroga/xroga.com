import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const ENTRY=read('./universalEntrypoint.ts');
const PIPELINE=read('../ai/pipeline.ts');
const SWARM=read('../routes/swarm.ts');

test('a Builder-bound run is granted repository authorities even without a GitHub repository',()=>{
  assert.match(ENTRY,/\.\.\.\(input\.activeProjectContext \|\| input\.builderBound\s*\?\s*\[\s*'repository:read',\s*'repository:write',\s*\]\s*:\s*\[\]\)/);
});

test('only the pipeline sets the Builder binding, alongside the server-resolved builder commit',()=>{
  assert.match(PIPELINE,/\.\.\.\(opts\.builder \? \{ commit: opts\.builder\.commit, builderBound: true \} : \{\}\)/);
});

test('the binding is never read from a request body',()=>{
  assert.ok(!/builderBound/.test(SWARM));
  assert.ok(!/req\.body[^;\n]*builderBound/.test(PIPELINE));
});
