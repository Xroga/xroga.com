import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

test('private R2 factories are canonical storage, explicit operator migrations and bounded workflow fixtures, without client injection',()=>{
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../../..');
  const files=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/))]
    .filter(p=>/^(backend\/src\/|frontend\/src\/|workers\/|scripts\/)/.test(p)&&/\.[cm]?[jt]sx?$/.test(p)&&!/(\.test\.|\.integration\.|\/__tests__\/|\/fixtures\/)/.test(p));
  const imports:string[]=[],sites:string[]=[],operatorFixtureImports:string[]=[];
  for(const path of files){
    if(path==='backend/src/storage/r2ObjectStore.ts')continue;
    const ast=ts.createSourceFile(path,readFileSync(resolve(root,path),'utf8'),ts.ScriptTarget.Latest,true);
    const visit=(node:ts.Node)=>{
      if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)
        &&/(?:^|\/)r2ObjectStore(?:\.js)?$/.test(node.moduleSpecifier.text)){
        assert.ok(ts.isImportDeclaration(node)&&node.importClause?.namedBindings&&ts.isNamedImports(node.importClause.namedBindings),'No hidden re-export or namespace constructor');
        imports.push(path);
        for(const item of node.importClause.namedBindings.elements)assert.equal(item.propertyName,undefined,'Factory imports cannot alias this reviewed constructor');
      }
      if((ts.isCallExpression(node)||ts.isNewExpression(node))&&node.expression.getText(ast)==='R2ObjectStore'){
        assert.ok(ts.isNewExpression(node));assert.equal(node.arguments?.length,1,'Production cannot inject a different SDK endpoint/client');sites.push(path);
      }
      if(ts.isCallExpression(node)&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0])&&node.arguments[0].text.includes('r2ObjectStore')){
        assert.equal(node.expression.kind,ts.SyntaxKind.ImportKeyword);
        assert.equal(path,'scripts/browser/run-workflows.mts','Only the existing explicit operator workflow fixture imports storage dynamically');
        assert.equal(node.arguments[0].text,'../../backend/src/storage/r2ObjectStore.js');operatorFixtureImports.push(path);
      }
      ts.forEachChild(node,visit);
    };visit(ast);
  }
  assert.deepEqual(imports.sort(),['backend/src/storage/migration/cliContext.ts','backend/src/storage/runtime.ts','scripts/storage/inventory-storage.mts']);
  assert.deepEqual(operatorFixtureImports,['scripts/browser/run-workflows.mts','scripts/browser/run-workflows.mts']);
  assert.deepEqual(sites.sort(),['backend/src/storage/migration/cliContext.ts','backend/src/storage/migration/cliContext.ts','backend/src/storage/runtime.ts',
    'scripts/browser/run-workflows.mts','scripts/browser/run-workflows.mts','scripts/browser/run-workflows.mts','scripts/storage/inventory-storage.mts']);
});
