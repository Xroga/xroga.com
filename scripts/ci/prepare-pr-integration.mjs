import { execFileSync } from 'node:child_process';
import { mkdirSync,writeFileSync,copyFileSync,readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root,verifyToolchain } from './toolchain.mjs';
import { discoverPersistenceCalls } from '../security/audit-tenant-policies.mjs';

/** Retire only reviewed false positives from files with no remaining candidates.
 * A moved/changed real caller still fails the unchanged semantic review validator.
 * The feature registry remains immutable and the integration receipt lists removals.
 */
export function projectVanishedNonPersistenceReviews(registry,{readFeature,readIntegrated}) {
  const retired=[];
  const reviews=registry.reviews.filter(record=>{
    if(record.disposition!=='NOT_PERSISTENCE')return true;
    const current=readIntegrated(record.path);
    if(typeof current!=='string'||discoverPersistenceCalls(record.path,current).length!==0)return true;
    const original=readFeature(record.path);
    if(typeof original!=='string'||createHash('sha256').update(original.replace(/\r\n/g,'\n')).digest('hex')!==record.sourceSha256)throw new Error('Unbound original non-persistence review');
    const originalCalls=discoverPersistenceCalls(record.path,original);
    if(!record.callIds.length||record.callIds.some(id=>!originalCalls.some(c=>c.id===id&&c.kind==='TABLE_OR_BUCKET_CANDIDATE')))throw new Error('Original false-positive identity is unavailable');
    if(record.structuredOrigin)throw new Error('Cannot retire a partitioned security obligation');
    retired.push({path:record.path,callIds:record.callIds,originalSourceSha256:record.sourceSha256,
      integratedSourceSha256:createHash('sha256').update(current.replace(/\r\n/g,'\n')).digest('hex'),
      reason:'Previously reviewed NOT_PERSISTENCE expressions are absent. The integrated file has zero scanner candidates. No security boundary is certified or waived.'});
    return false;
  });
  return {registry:{...registry,reviews},retired};
}

export function validateIntegrationIdentity({ci,event,head,parents,expectedHead,expectedBase,baseSnapshotIsAncestor=false}) {
  if(ci!=='true'||event!=='pull_request')throw new Error('Only isolated pull-request CI may project integration inventories');
  if(![head,expectedHead,expectedBase,...parents].every(value=>/^[a-f0-9]{40}$/.test(value??'')))throw new Error('Missing exact integration identity');
  if(parents.length!==2||(parents[0]!==expectedBase&&!baseSnapshotIsAncestor)||parents[1]!==expectedHead||head===expectedHead)throw new Error('Virtual merge does not match the event head or verified base lineage');
  return {sourceSha:head,baseSha:parents[0],reportedBaseSnapshot:expectedBase,featureSha:expectedHead,scope:'VIRTUAL_MERGE_CANDIDATE_NOT_COMMITTED_TRUTH_OR_RELEASE_APPROVAL'};
}

const outputs=[
  'docs/xroga/security/caller-reviews.json',
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
  const registryPath='docs/xroga/security/caller-reviews.json';
  const projected=projectVanishedNonPersistenceReviews(JSON.parse(readFileSync(join(root,registryPath),'utf8')),{
    readFeature:path=>execFileSync('git',['show',`${identity.featureSha}:${path}`],{cwd:root,encoding:'utf8'}),
    readIntegrated:path=>readFileSync(join(root,path),'utf8'),
  });
  if(projected.retired.length)writeFileSync(join(root,registryPath),`${JSON.stringify(projected.registry,null,2)}\n`);
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
  writeFileSync(join(target,'provenance.json'),`${JSON.stringify({...identity,changedDerivedFiles:changed,retiredNonPersistenceReviews:projected.retired,productionEffects:false,releaseGate:'BLOCKED'},null,2)}\n`);
  console.log(JSON.stringify(identity));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
