import { execFileSync } from 'node:child_process';
import { mkdirSync,writeFileSync,copyFileSync } from 'node:fs';
import { join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root,verifyToolchain } from './toolchain.mjs';

export function validateIntegrationIdentity({ci,event,head,parents,expectedHead,expectedBase,baseSnapshotIsAncestor=false}) {
  if(ci!=='true'||event!=='pull_request')throw new Error('Only isolated pull-request CI may project integration inventories');
  if(![head,expectedHead,expectedBase,...parents].every(value=>/^[a-f0-9]{40}$/.test(value??'')))throw new Error('Missing exact integration identity');
  if(parents.length!==2||(parents[0]!==expectedBase&&!baseSnapshotIsAncestor)||parents[1]!==expectedHead||head===expectedHead)throw new Error('Virtual merge does not match the event head or verified base lineage');
  return {sourceSha:head,baseSha:parents[0],reportedBaseSnapshot:expectedBase,featureSha:expectedHead,scope:'VIRTUAL_MERGE_CANDIDATE_NOT_COMMITTED_TRUTH_OR_RELEASE_APPROVAL'};
}

const outputs=[
  'docs/xroga/security/privileged-callers.json','docs/xroga/security/rls-audit.md',
  'docs/xroga/current-state.json','docs/xroga/current-state-schema.json','docs/xroga/current-state.md','docs/xroga/blockers.md',
  'docs/xroga/dependency-inventory.json','docs/xroga/dependency-inventory.schema.json',
  'docs/xroga/deployment-topology.md','docs/xroga/deployment-topology.mmd','docs/xroga/runtime-contract.md','docs/xroga/secret-inventory.md',
  'docs/xroga/requirements-ledger.json','docs/xroga/requirements-ledger.schema.json','docs/xroga/requirements-ledger.md',
  'docs/xroga/feature-coverage.csv','docs/xroga/repository-candidate-register.md',
  'docs/xroga/research/source-manifest.json','docs/xroga/research/source-reconciliation.md',
];

export function main() {
  verifyToolchain();
  const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
  if(git(['status','--porcelain','--untracked-files=no']))throw new Error('Integration projection requires an unchanged checkout');
  const parents=git(['show','-s','--format=%P','HEAD']).split(' ');
  // GitHub can retain the PR's old base snapshot while its virtual merge uses
  // newer main. Record the REAL first parent; accept the old snapshot only
  // after checking ancestry, never merely from a caller-supplied boolean.
  let baseSnapshotIsAncestor=false;
  if(/^[a-f0-9]{40}$/.test(process.env.PR_BASE_SHA??'')&&/^[a-f0-9]{40}$/.test(parents[0]??'')) {
    try {git(['merge-base','--is-ancestor',process.env.PR_BASE_SHA,parents[0]]);baseSnapshotIsAncestor=true;}catch{/* Fail closed for rewritten/unrelated history. */}
  }
  const identity=validateIntegrationIdentity({ci:process.env.CI,event:process.env.GITHUB_EVENT_NAME,
    head:git(['rev-parse','HEAD']),parents,baseSnapshotIsAncestor,
    expectedHead:process.env.PR_HEAD_SHA,expectedBase:process.env.PR_BASE_SHA});
  // No authority/fixture records are invented. Stale manual semantic reviews
  // still fail; all original baseline stages run after this bounded projection.
  for(const args of [
    ['scripts/security/audit-tenant-policies.mjs','--write'],
    ['scripts/xroga/runtime-inventory.mjs'],['scripts/xroga/inventory.mjs','--refresh'],
    ['scripts/xroga/reconcile-requirements.mjs'],
  ])execFileSync(process.execPath,args,{cwd:root,stdio:'inherit'});
  const changed=git(['diff','--name-only']).split(/\r?\n/).filter(Boolean);
  if(changed.some(path=>!outputs.includes(path)))throw new Error('Integration projection altered non-derived source');
  const target=join(root,'artifacts/batch-01-integration');mkdirSync(target,{recursive:true});
  for(const path of outputs)copyFileSync(join(root,path),join(target,path.replaceAll('/','__')));
  writeFileSync(join(target,'provenance.json'),`${JSON.stringify({...identity,changedDerivedFiles:changed,productionEffects:false,releaseGate:'BLOCKED'},null,2)}\n`);
  console.log(JSON.stringify(identity));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
