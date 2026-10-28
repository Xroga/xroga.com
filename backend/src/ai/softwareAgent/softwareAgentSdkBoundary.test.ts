import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {createTenantContext} from '../../security/tenantContext.js';
import {runUniversalSoftwareImplementation,type UniversalSoftwareImplementationInput} from '../../synthesis/softwareAgentImplementationAdapter.js';

test('actual universal SoftwareAgent implementation refuses unissued identity before constructing adapters',async()=>{
  const userId='11111111-1111-4111-8111-111111111111';
  const context=createTenantContext({userId,via:'remote_getuser'});
  const inaccessible=()=>{throw new Error('Must reject before accessing runtime/model configuration');};
  const input=(tenantContext?:typeof context,owner=userId)=>({userId:owner,tenantContext,get primaryModelId(){return inaccessible();}} as unknown as UniversalSoftwareImplementationInput);
  await assert.rejects(runUniversalSoftwareImplementation(input()),{code:'TENANT_AUTH_REQUIRED'});
  await assert.rejects(runUniversalSoftwareImplementation(input({...context})),{code:'TENANT_AUTH_REQUIRED'});
  await assert.rejects(runUniversalSoftwareImplementation(input(context,'22222222-2222-4222-8222-222222222222')),{code:'RESOURCE_NOT_FOUND'});
});

test('tracked production SoftwareAgent SDK caller carries original identity through both universal branches',()=>{
  const root=resolve(fileURLToPath(new URL('../../../../',import.meta.url)));
  const paths=execFileSync('git',['ls-files','backend/src'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/)
    .filter(p=>p.endsWith('.ts')&&!/\.test\.|\.integration\.|\/fixtures\//.test(p));
  const imports:string[]=[];
  for(const path of paths){
    const text=readFileSync(resolve(root,path),'utf8');
    if(!text.includes('xrogaAgentModel.js'))continue;
    const ast=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true);
    for(const node of ast.statements)if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier)&&node.moduleSpecifier.text.endsWith('/xrogaAgentModel.js'))imports.push(path);
  }
  assert.deepEqual(imports,['backend/src/synthesis/softwareAgentImplementationAdapter.ts']);
  const adapter=readFileSync(resolve(root,imports[0]),'utf8');
  assert.match(adapter,/const context=requireTenantContext\(input\.tenantContext\)/);
  assert.match(adapter,/requireResourceOwner\(context,input\.userId\)/);
  assert.match(adapter,/dispatchScope:\{context,userId:input\.userId,projectId:input\.databaseProjectId,runAttempt:input\.modelRunAttempt,repository:input\.modelRepository,connectedAccountId:'platform'\}/);
  const entry=readFileSync(resolve(root,'backend/src/synthesis/universalEntrypoint.ts'),'utf8');
  assert.equal([...entry.matchAll(/tenantContext:input\.tenantContext,databaseProjectId:input\.databaseProjectId,modelRunAttempt:input\.modelRunAttempt,modelRepository:input\.modelRepository/g)].length,2);
  const model=readFileSync(resolve(root,'backend/src/ai/softwareAgent/xrogaAgentModel.ts'),'utf8');
  assert.doesNotMatch(model,/withProviderReservation/);
  assert.match(model,/createModelProviderClient\(endpoint,dispatch\.beforeDispatch\)/);
  assert.match(model,/return withTenantModelReservation\(/);
  assert.match(model,/await persistUsageAccounting\(context,/);
  // This source-graph assertion supports the real SDK protocol tests. It is
  // neither generated-code reachability proof nor certification of tool effects.
});
