import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

test('the two dormant content-upload and communication adapters have no current production importer or exported-call reference',()=>{
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../../..');
  const targets=new Map([
    ['backend/src/synthesis/chain/advancedWeb3.ts','persistAndVerifyContent'],
    ['backend/src/synthesis/integrations/communicationAi.ts','sendCommunication'],
  ]);
  const paths=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/))]
    .filter(p=>/^(backend\/src|frontend\/src|workers|scripts|deploy)\//.test(p)&&/\.[cm]?[jt]sx?$/.test(p)&&!/(\.test\.|\.integration\.|\/__tests__\/|\/fixtures\/)/.test(p));
  for(const path of targets.keys())assert.ok(paths.includes(path));
  for(const path of paths){
    const text=readFileSync(resolve(root,path),'utf8'),ast=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true,path.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
    const visit=(node:ts.Node)=>{
      for(const[target,symbol]of targets){
        if(path===target)continue;
        if(ts.isIdentifier(node))assert.notEqual(node.text,symbol,`${path} references dormant export ${symbol}`);
        if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)){
          const name=target.split('/').at(-1)!.replace(/\.ts$/,'');
          assert.ok(!new RegExp('(?:^|/)'+name+'(?:\\.[cm]?[jt]s)?$').test(node.text.replaceAll('\\','/')),`${path} references dormant module ${name}`);
          assert.notEqual(node.text,symbol,`${path} dynamically references dormant export ${symbol}`);
        }
      }
      ts.forEachChild(node,visit);
    };visit(ast);
  }
  // Current known source graph only. No adapter is invoked or treated as safe to
  // activate. Future imports and reflective/generated loaders require review.
});
