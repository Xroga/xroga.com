import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

test('unused hosted Browserbase adapters and API-host Playwright driver have no current production runtime importer',()=>{
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../../..');
  const paths=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/))]
    .filter(p=>/^(backend\/src|frontend\/src|workers)\//.test(p)&&/\.[cm]?[jt]sx?$/.test(p)&&!/(\.test\.|\.integration\.|\/__tests__\/|\/fixtures\/)/.test(p));
  const hosted='backend/src/lib/browserbase.ts',driver='backend/src/synthesis/playwrightDriver.ts';
  assert.ok(paths.includes(hosted));assert.ok(paths.includes(driver));let admittedTypes=0;
  for(const path of paths){
    if(path===hosted||path===driver)continue;
    const text=readFileSync(resolve(root,path),'utf8');
    assert.doesNotMatch(text,/\b(?:runBrowserbaseScript|createBrowserbaseSession|runPlaywrightVerification|browserAvailable)\b/,path);
    const source=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true,path.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
    const visit=(node:ts.Node)=>{
      if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)){
        const spec=node.moduleSpecifier.text;
        assert.ok(!/(?:^|\/)browserbase(?:\.js)?$/.test(spec),path+' imports unused hosted browser execution');
        if(/(?:^|\/)playwrightDriver(?:\.js)?$/.test(spec)){
          assert.ok(ts.isImportDeclaration(node)&&node.importClause?.isTypeOnly,path+' must not turn the disposable API-host driver into production execution');admittedTypes++;
        }
      }
      if(ts.isCallExpression(node)&&node.arguments.some(a=>ts.isStringLiteral(a)&&/\/(?:browserbase|playwrightDriver)(?:\.js)?$/.test(a.text)))assert.fail(path+' dynamically loads an unreviewed browser adapter');
      ts.forEachChild(node,visit);
    };visit(source);
  }
  assert.equal(admittedTypes,2,'Preserve both actual sandbox browser expectation type imports');
  // Current graph only. Canonical Google in-sandbox/browser-worker execution is
  // separate and retains all its independent authority and network obligations.
});
