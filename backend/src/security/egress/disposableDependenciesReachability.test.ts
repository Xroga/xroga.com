import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

test('TLS test subprocesses and retired R2 deletion have no current production source callers', () => {
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../../..');
  const paths=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/))]
    .filter(p=>/^(backend\/src|frontend\/src|workers)\//.test(p)&&/\.[cm]?[jt]sx?$/.test(p)&&!/(\.test\.|\.integration\.|\/__tests__\/|\/fixtures\/)/.test(p));
  const fixture='backend/src/storage/testing/tlsFixture.ts',r2='backend/src/lib/r2.ts';
  assert.ok(paths.includes(fixture));assert.ok(paths.includes(r2));
  for(const path of paths){
    const source=readFileSync(resolve(root,path),'utf8');
    if(path!==fixture){
      assert.doesNotMatch(source,/\btlsFixture\b/,path);
      assert.doesNotMatch(source,/\b(?:makeTlsFixture|opensslAvailable|startStubPostgres)\b/,path);
    }
    if(path!==r2){
      assert.doesNotMatch(source,/\bremoveNewR2Object\b/,path);
      // A wildcard export/import could hide a new use of the retired function.
      assert.doesNotMatch(source,/(?:import|export)\s*\*[^\n]*['"][^'"]*\/r2(?:\.js)?['"]/,path);
      assert.doesNotMatch(source,/(?:import\s*\(|require\s*\()[^\n]*['"][^'"]*\/r2(?:\.js)?['"]/,path);
    }
  }
  // Current repository graph only. Any new importer invalidates this review.
  // This does not authorize generated code, arbitrary reflection or future tools.
});
