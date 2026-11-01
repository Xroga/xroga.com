import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

test('legacy processTree helpers have no current production runtime or operator importer',()=>{
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../../..');
  const files=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/))]
    .filter(p=>/^(backend\/src\/|frontend\/src\/|workers\/|scripts\/|deploy\/)/.test(p)&&/\.[cm]?[jt]sx?$/.test(p)&&!/(\.test\.|\.integration\.|\/__tests__\/|\/fixtures\/)/.test(p));
  assert.ok(files.includes('backend/src/workers/processTree.ts'));
  for(const path of files){
    if(path==='backend/src/workers/processTree.ts')continue;
    const source=ts.createSourceFile(path,readFileSync(resolve(root,path),'utf8'),ts.ScriptTarget.Latest,true);
    const visit=(node:ts.Node)=>{
      if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))
        assert.ok(!/(?:^|\/)processTree(?:\.[cm]?[jt]s)?$/.test(node.moduleSpecifier.text),path+' imports inactive process execution');
      if(ts.isCallExpression(node)){
        if(ts.isIdentifier(node.expression))assert.ok(!['runBounded','killTree'].includes(node.expression.text),path+' invokes an inactive helper');
        if(node.arguments[0]&&ts.isStringLiteral(node.arguments[0]))assert.ok(!node.arguments[0].text.includes('processTree'),path+' dynamically loads inactive process execution');
      }
      ts.forEachChild(node,visit);
    };visit(source);
  }
});
