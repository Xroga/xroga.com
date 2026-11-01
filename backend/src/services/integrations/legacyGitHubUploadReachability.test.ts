import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

test('legacy GitHub mirror writer has no production importer or invocation in the tracked source graph', () => {
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../../..');
  const paths=execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/)
    .filter(p=>/^(backend\/src|frontend\/src|workers)\//.test(p)&&/\.[cm]?[jt]sx?$/.test(p)&&!/(\.test\.|\.integration\.|\/__tests__\/|\/fixtures\/)/.test(p));
  const module='backend/src/services/integrations/githubTokenStore.ts';
  assert.ok(paths.includes(module));
  for(const path of paths.filter(p=>p!==module)){
    const text=readFileSync(resolve(root,path),'utf8');
    assert.doesNotMatch(text,/\bsaveGitHubTokenToStorage\b/,path);
    assert.doesNotMatch(text,/(?:import\s*\(|require\s*\()[^\n]*githubTokenStore/,path);
    assert.doesNotMatch(text,/(?:import|export)\s*\*[^\n]*githubTokenStore/,path);
  }
  // This is current-source reachability proof, not approval of a future caller,
  // a reopened production migration window, or arbitrary reflection/generated code.
});
