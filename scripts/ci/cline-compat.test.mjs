import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchedSource, targets, verifyOrApply } from '../../backend/scripts/cline-git-compat.mjs';

test('actual Cline receiver carries all reviewed import patches and license notices',()=>{
  const proof=verifyOrApply();assert.equal(proof.core,'0.0.82');assert.equal(proof.git,'4.0.2');assert.equal(proof.files.length,3);
  for(const file of proof.files)assert.notEqual(file.originalSha256,file.installedSha256);
});
test('compatibility transform is idempotent for each pinned published bundle',()=>{
  const core=dirname(dirname(fileURLToPath(import.meta.resolve('@cline/core'))));
  for(const target of targets){const source=readFileSync(join(core,target.file),'utf8');assert.equal(patchedSource(source,target),source);}
});
test('altered or unknown Cline runtime bytes fail closed instead of receiving a fuzzy patch',()=>{
  const core=dirname(dirname(fileURLToPath(import.meta.resolve('@cline/core'))));
  const source=readFileSync(join(core,targets[0].file),'utf8');
  assert.throws(()=>patchedSource(source+'\n/* unknown runtime */',targets[0]),/Unreviewed Cline bundle/);
  assert.throws(()=>patchedSource(source,{...targets[0],sha256:'0'.repeat(64)}),/Unreviewed Cline bundle/);
});
