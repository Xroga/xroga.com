import { execFileSync } from 'node:child_process';
import { mkdirSync,writeFileSync,copyFileSync,readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root,verifyToolchain } from './toolchain.mjs';
import { discoverPersistenceCalls } from '../security/audit-tenant-policies.mjs';
import {buildPhaseOne} from '../xroga/phase-one.mjs';
import ts from 'typescript';

/** Only the current-caller proof template is derived from projected reviews.
 * Frozen mappings, original criteria and prior accepted evidence never change.
 */
export function integrationAdmissionProjection(outputs,readExisting){
  const path='docs/xroga/security/tenant-invariant-obligations.json';
  for(const[key,value]of outputs)if(key!==path&&readExisting(key).replace(/\r\n/g,'\n')!==value)throw new Error(`Immutable Phase1 mapping drift:${key}`);
  const content=outputs.get(path);if(typeof content!=='string')throw new Error('Missing derived admission template');
  const admission=JSON.parse(content);
  if(admission.proofs.length!==0||admission.criteria.length!==10||admission.criteria.some(c=>c.status!=='BLOCKED'||c.proofIds.length!==0))throw new Error('Integration generation cannot grant acceptance');
  return {path,content};
}

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

// Current-main #836 changed both rendering closures. These exact source/function
// pairs were traced to local native Maps. Only the two Array.from expressions
// are re-reviewed as non-persistence. New browser DML/RPC callers remain separate
// unreviewed obligations and receive no inherited Phase2 certification.
export const reviewedIntegrationArrayFunctions=[{
  path:'frontend/src/components/layout/SidebarProjectHistory.tsx',
  reviewedMainSource:'20ba42d658140994dbcd4ef58b07782cbe413b72',
  featureSourceSha256:'630ba11b6c231c10e4e7aa507a0cec0a235fb1f27fa47d762cc61168e2d8f7f2',
  integratedSourceSha256:'bb2f850e69f6a691f2fb860aa89ac8dd46c7f93cfb16150a45833c2c88b3acb4',
  functions:[
    {expression:'Array.from(map.entries())',featureFunctionSha256:'a399d8feced2e64045f9c7d086c8878bc76c6b17874e3376545001eb973673da',integratedFunctionSha256:'568050b634fae4a9eb81ffa6e802f1f7aaa0e6defbea7d80c8d9bc7c2bee489f'},
    {expression:'Array.from(map.values())',featureFunctionSha256:'6be87375c23e02972092cc94ef24f9088b264acd195ac71f418ae894be8d1be7',integratedFunctionSha256:'08d4a416b11e23728a49e4a98aace266d039d70a72a02971bb764a73ad5c28f0'},
  ],
}];

/** Preserve only a reviewed native Array.from conversion whose entire nearest
 * function is byte-identical and unique in the integrated source. This does
 * not transfer a persistence/authority review or certify surrounding new UI.
 * Shadowing, reassignment, changed functions and ambiguous matches stay stale.
 */
export function projectStableArrayConversionReviews(registry,{readFeature,readIntegrated,reviewedFunctionChanges=reviewedIntegrationArrayFunctions}) {
  const hash=value=>createHash('sha256').update(value).digest('hex');
  const inspect=(path,text)=>{
    const file=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),calls=[];
    const unsafeNames=new Set();
    const visit=node=>{
      if((ts.isIdentifier(node)||ts.isStringLiteral(node))&&['Array','Uint8Array'].includes(node.text)){
        const parent=node.parent;
        if(!ts.isIdentifier(node)||!ts.isPropertyAccessExpression(parent)||parent.expression!==node
          ||!['from','isArray'].includes(parent.name.text)||!ts.isCallExpression(parent.parent)||parent.parent.expression!==parent)unsafeNames.add(node.text);
      }
      if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)
        &&ts.isIdentifier(node.expression.expression)&&['Array','Uint8Array'].includes(node.expression.expression.text)&&node.expression.name.text==='from'){
        let enclosing=node.parent;
        while(enclosing&&!ts.isFunctionDeclaration(enclosing)&&!ts.isFunctionExpression(enclosing)&&!ts.isArrowFunction(enclosing)&&!ts.isMethodDeclaration(enclosing))enclosing=enclosing.parent;
        if(enclosing)calls.push({line:file.getLineAndCharacterOfPosition(node.getStart(file)).line+1,
          expression:node.getText(file),fn:enclosing.getText(file),native:node.expression.expression.text});
      }
      ts.forEachChild(node,visit);
    };visit(file);return {unsafeNames,calls};
  };
  const rebound=[];
  const reviews=registry.reviews.map(record=>{
    if(record.disposition!=='NOT_PERSISTENCE'||record.structuredOrigin)return record;
    const current=readIntegrated(record.path);
    if(typeof current!=='string'||hash(current.replace(/\r\n/g,'\n'))===record.sourceSha256)return record;
    const original=readFeature(record.path);
    if(typeof original!=='string'||hash(original.replace(/\r\n/g,'\n'))!==record.sourceSha256)throw new Error('Unbound original conversion review');
    const before=inspect(record.path,original),after=inspect(record.path,current);
    const explicit=reviewedFunctionChanges.find(review=>review.path===record.path
      &&review.featureSourceSha256===record.sourceSha256&&review.integratedSourceSha256===hash(current.replace(/\r\n/g,'\n')));
    const oldCandidates=discoverPersistenceCalls(record.path,original),newCandidates=discoverPersistenceCalls(record.path,current),ids=[],functions=[],changedFunctions=[];
    for(const id of record.callIds){
      const candidate=oldCandidates.find(call=>call.id===id&&call.kind==='TABLE_OR_BUCKET_CANDIDATE');
      const old=before.calls.filter(call=>call.line===candidate?.line);
      if(old.length!==1||before.unsafeNames.has(old[0].native)||after.unsafeNames.has(old[0].native))return record;
      const matching=after.calls.filter(call=>call.expression===old[0].expression&&(call.fn===old[0].fn
        ||explicit?.functions.some(review=>review.expression===call.expression
          &&review.featureFunctionSha256===hash(old[0].fn)&&review.integratedFunctionSha256===hash(call.fn))));
      if(matching.length!==1)return record;
      const target=newCandidates.filter(call=>call.line===matching[0].line&&call.kind==='TABLE_OR_BUCKET_CANDIDATE');
      if(target.length!==1)return record;
      ids.push(target[0].id);
      if(matching[0].fn===old[0].fn)functions.push(hash(old[0].fn));
      else changedFunctions.push({expression:old[0].expression,featureFunctionSha256:hash(old[0].fn),integratedFunctionSha256:hash(matching[0].fn),reviewedMainSource:explicit.reviewedMainSource});
    }
    if(!ids.length||new Set(ids).size!==ids.length)return record;
    const sourceSha256=hash(current.replace(/\r\n/g,'\n'));
    rebound.push({path:record.path,originalCallIds:record.callIds,integratedCallIds:ids,
      originalSourceSha256:record.sourceSha256,integratedSourceSha256:sourceSha256,unchangedFunctionSha256:functions,
      reviewedChangedFunctions:changedFunctions,
      scope:changedFunctions.length?'EXPLICIT_SOURCE_BOUND_NATIVE_ARRAY_CONVERSION_NOT_SECURITY_CERTIFICATION':'ONLY_BYTE_IDENTICAL_NATIVE_ARRAY_CONVERSION_NOT_SECURITY_CERTIFICATION'});
    return {...record,sourceSha256,callIds:ids};
  });
  return {registry:{...registry,reviews},rebound};
}

export function validateIntegrationIdentity({ci,event,head,parents,expectedHead,expectedBase,baseSnapshotIsAncestor=false}) {
  if(ci!=='true'||event!=='pull_request')throw new Error('Only isolated pull-request CI may project integration inventories');
  if(![head,expectedHead,expectedBase,...parents].every(value=>/^[a-f0-9]{40}$/.test(value??'')))throw new Error('Missing exact integration identity');
  if(parents.length!==2||(parents[0]!==expectedBase&&!baseSnapshotIsAncestor)||parents[1]!==expectedHead||head===expectedHead)throw new Error('Virtual merge does not match the event head or verified base lineage');
  return {sourceSha:head,baseSha:parents[0],reportedBaseSnapshot:expectedBase,featureSha:expectedHead,scope:'VIRTUAL_MERGE_CANDIDATE_NOT_COMMITTED_TRUTH_OR_RELEASE_APPROVAL'};
}

const outputs=[
  'docs/xroga/security/caller-reviews.json',
  'docs/xroga/security/tenant-invariant-obligations.json',
  'docs/xroga/security/privileged-callers.json','docs/xroga/security/rls-audit.md',
  'docs/xroga/security/credential-usage-audit.json',
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
  const stable=projectStableArrayConversionReviews(projected.registry,{
    readFeature:path=>execFileSync('git',['show',`${identity.featureSha}:${path}`],{cwd:root,encoding:'utf8'}),
    readIntegrated:path=>readFileSync(join(root,path),'utf8'),
  });
  if(projected.retired.length||stable.rebound.length)writeFileSync(join(root,registryPath),`${JSON.stringify(stable.registry,null,2)}\n`);
  const admission=integrationAdmissionProjection(buildPhaseOne().outputs,path=>readFileSync(join(root,path),'utf8'));
  writeFileSync(join(root,admission.path),admission.content);
  // No authority/fixture records are invented. Stale manual semantic reviews
  // still fail; all original baseline stages run after this bounded projection.
  for(const args of [
    ['scripts/security/audit-tenant-policies.mjs','--write'],
    ['scripts/security/audit-credential-usage.mjs','--write'],
    ['scripts/xroga/runtime-inventory.mjs'],['scripts/xroga/inventory.mjs','--refresh'],
    ['scripts/xroga/reconcile-requirements.mjs'],
  ])execFileSync(process.execPath,args,{cwd:root,stdio:'inherit'});
  const changed=git(['diff','--name-only']).split(/\r?\n/).filter(Boolean);
  if(changed.some(path=>!outputs.includes(path)))throw new Error('Integration projection altered non-derived source');
  const target=join(root,'artifacts/batch-01-integration');mkdirSync(target,{recursive:true});
  for(const path of outputs)copyFileSync(join(root,path),join(target,path.replaceAll('/','__')));
  writeFileSync(join(target,'provenance.json'),`${JSON.stringify({...identity,changedDerivedFiles:changed,retiredNonPersistenceReviews:projected.retired,reboundArrayConversionReviews:stable.rebound,productionEffects:false,releaseGate:'BLOCKED'},null,2)}\n`);
  console.log(JSON.stringify(identity));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
