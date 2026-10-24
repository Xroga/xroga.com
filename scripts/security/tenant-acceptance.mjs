import { createHash } from 'node:crypto';

export const invariantStates = Object.freeze(['CONFIRMED_DEFECT','CREDIBLE_RISK','EVIDENCE_GAP','VERIFIED_BOUNDARY',
  'APPROVED_NARROW_EXCEPTION','NOT_PERSISTENCE','EXTERNAL_BLOCKER','OUT_OF_SCOPE_WITH_PROVENANCE']);
export const tenantCriteria = Object.freeze([
  'Every tenant-bearing table is in rls-audit.md.',
  'Every privileged caller is scoped or explicitly exempt.',
  'Cross-tenant negative tests cover all high-risk resource classes.',
  'No protected endpoint trusts client-supplied ownership without verification.',
  'Background run ownership survives queue/job boundaries.',
  'Provider connection selection is owner scoped.',
  'CI executes tenant isolation tests.',
  'Migration passes fresh DB and upgrade-path tests.',
  'No existing legitimate same-tenant journey is broken.',
  'Security review contains zero unexplained service-role bypasses.',
]);
export const highRiskClasses = Object.freeze(['projects','chats','files','connections','runs','browser','costs','approvals']);
const digest = text => createHash('sha256').update(text.replace(/\r\n/g,'\n')).digest('hex');
const safePath = path => typeof path==='string' && /^(backend|frontend|scripts|supabase|docs|tests|artifacts)\//.test(path)
  && !path.split('/').some(part=>part==='..'||part==='') && !path.includes('\\');
const criterionId = n => `XB01-C007-AC${String(n).padStart(2,'0')}`;

/** Pure fail-closed evaluator. Trusted receipts are supplied separately by the
 * verification collector, never inferred from a submitted PASS or test marker.
 * Synthetic fixture success verifies this evaluator, not the real repository. */
export function evaluateTenantAcceptance(input,{readAsset,receipts=[],exceptions=[],expectedSourceSha,verifyProviderReceipt=()=>false}) {
  const failures=[];
  const fail = (code,id) => failures.push({code,id});
  if(input?.version!==1 || !/^[a-f0-9]{40}$/.test(input.sourceSha??''))fail('INVALID_SOURCE','source');
  if(!/^[a-f0-9]{40}$/.test(expectedSourceSha??'')||input.sourceSha!==expectedSourceSha)fail('SOURCE_SNAPSHOT_MISMATCH','source');
  const candidates=new Map((input.callers??[]).map(c=>[c.id,c]));
  if(candidates.size!==(input.callers??[]).length)fail('DUPLICATE_CALLER','inventory');
  const receiptMap=new Map(receipts.map(r=>[r.id,r])),proofs=new Map(),seenProofs=new Set();
  const proofValid = proof => {
    if(!proof || seenProofs.has(proof.id))return false;
    seenProofs.add(proof.id);
    if(proof.sourceSha!==input.sourceSha || !['STATIC','LOCAL','DISPOSABLE','PROVIDER'].includes(proof.kind)
      || !safePath(proof.artifact?.path) || !/^[a-f0-9]{64}$/.test(proof.artifact.sha256??''))return false;
    const bytes=readAsset(proof.artifact.path);
    if(typeof bytes!=='string' || digest(bytes)!==proof.artifact.sha256)return false;
    if(proof.kind==='STATIC')return Array.isArray(proof.tests)&&proof.tests.length===0;
    const receipt=receiptMap.get(proof.receiptId);
    if(!receipt || receipt.sourceSha!==input.sourceSha || receipt.kind!==proof.kind || receipt.conclusion!=='success'
      || receipt.artifactSha256!==proof.artifact.sha256 || receipt.failed!==0 || receipt.skipped!==0
      || !Array.isArray(receipt.passedTests) || !Array.isArray(proof.tests) || !proof.tests.length
      || (proof.kind!=='LOCAL' && !/^\d+$/.test(receipt.runId??'')))return false;
    // A self-authored provider=true field cannot promote a synthetic/local run.
    if(proof.kind==='PROVIDER' && (!receipt.provider || !receipt.providerResource || !receipt.independentPostcondition || verifyProviderReceipt(receipt)!==true))return false;
    return proof.tests.every(t=>typeof t.id==='string' && receipt.passedTests.includes(t.id) && bytes.includes(t.id)
      && ['POSITIVE','NEGATIVE'].includes(t.polarity) && typeof t.boundaryId==='string'
      && receipt.testBindings?.some(b=>b.id===t.id&&b.boundaryId===t.boundaryId&&b.polarity===t.polarity));
  };
  for(const proof of input.proofs??[]) {
    if(proofValid(proof))proofs.set(proof.id,proof);
    else fail('INVALID_OR_UNATTESTED_PROOF',proof?.id??'missing');
  }
  const testsFor = (ids,boundary,polarity,kind) => (ids??[]).flatMap(id=>proofs.get(id)?[proofs.get(id)]:[])
    .some(p=>(!kind||p.kind===kind) && p.tests.some(t=>t.boundaryId===boundary&&t.polarity===polarity));
  const obligations=new Map(),byCaller=new Map();
  for(const obligation of input.obligations??[]) {
    const id=obligation?.id;
    let valid=true;
    const reject=code=>{valid=false;fail(code,id??'missing');};
    if(!id||obligations.has(id)||!invariantStates.includes(obligation.state)
      ||!Array.isArray(obligation.callerIds)||!obligation.callerIds.length)reject('INVALID_OBLIGATION');
    for(const callerId of obligation.callerIds??[]) {
      const caller=candidates.get(callerId);
      if(!caller || caller.path!==obligation.path || caller.sourceSha256!==obligation.sourceSha256)reject('STALE_CALLER_BINDING');
      const source=caller&&readAsset(caller.path);
      if(typeof source!=='string'||digest(source)!==obligation.sourceSha256)reject('CHANGED_CALLER_SOURCE');
      const list=byCaller.get(callerId)??[];list.push(id);byCaller.set(callerId,list);
    }
    if(obligation.state==='VERIFIED_BOUNDARY') {
      if(obligation.actorOrigin!=='SERVER_VERIFIED'||obligation.ownerBinding!=='EXACT_OWNER_PARENT')reject('UNBOUND_AUTHORITY');
      const secretBearing=obligation.secretBearing||(obligation.callerIds??[]).some(id=>{
        const caller=candidates.get(id);return /oauth|credential|providerkeys|githubtoken|runtimesecret/i.test(caller?.path??'')
          ||['user_integrations','github_tokens','project_runtime_secrets'].includes(caller?.target);
      });
      if(secretBearing && obligation.connectedAccountBound!==true)reject('UNBOUND_CREDENTIAL_ACCOUNT');
      if(!testsFor(obligation.proofIds,id,'POSITIVE')||!testsFor(obligation.proofIds,id,'NEGATIVE'))reject('MISSING_BOUNDARY_TESTS');
    } else if(obligation.state==='APPROVED_NARROW_EXCEPTION') {
      const exception=exceptions.find(e=>e.id===obligation.exceptionId);
      if(!exception || exception.path!==obligation.path || !Array.isArray(exception.callerIds) || !exception.callerIds.includes(obligation.callerIds[0])
        || obligation.callerIds.some(c=>!exception.callerIds.includes(c)) || !exception.operations?.length
        || exception.operations.some(op=>op==='*') || !exception.authority || !exception.reason)reject('INVALID_EXCEPTION');
      if(!testsFor(obligation.proofIds,id,'POSITIVE')||!testsFor(obligation.proofIds,id,'NEGATIVE'))reject('MISSING_EXCEPTION_TESTS');
    } else if(obligation.state==='NOT_PERSISTENCE') {
      if(!safePath(obligation.review?.path)||!obligation.review.marker||typeof obligation.reason!=='string'||obligation.reason.length<40)reject('MISSING_NON_PERSISTENCE_REVIEW');
      else {const text=readAsset(obligation.review.path);if(typeof text!=='string'||!text.includes(obligation.review.marker)
        ||digest(text)!==obligation.review.sha256)reject('STALE_NON_PERSISTENCE_REVIEW');}
    } else {
      // External/out-of-scope classifications preserve an open original007
      // obligation. Neither is an exemption or a blanket caller closure.
      reject(`OPEN_${obligation.state}`);
    }
    obligations.set(id,{...obligation,valid});
  }
  const callerResults=[...candidates.values()].map(caller=>{
    const ids=byCaller.get(caller.id)??[];
    if(!ids.length)fail('MISSING_CALLER_REVIEW',caller.id);
    return {id:caller.id,path:caller.path,kind:caller.kind,verified:ids.length>0&&ids.every(id=>obligations.get(id)?.valid),obligations:ids};
  });
  const allScoped=callerResults.length>0&&callerResults.every(c=>c.verified);
  const criteria=[];
  for(let n=1;n<=10;n++) {
    const id=criterionId(n),records=(input.criteria??[]).filter(c=>c.id===id),entry=records[0],reasons=[];
    if(records.length!==1||entry?.text!==tenantCriteria[n-1])reasons.push('MISSING_OR_MODIFIED_CRITERION');
    if(entry?.status!=='PASS')reasons.push('CRITERION_NOT_PASSED');
    if(!entry?.proofIds?.length||entry.proofIds.some(p=>!proofs.has(p)))reasons.push('MISSING_CRITERION_PROOF');
    if([2,10].includes(n)&&!allScoped)reasons.push('UNRESOLVED_PRIVILEGED_BOUNDARY');
    if(n===3||n===9)for(const resource of highRiskClasses) {
      if(!testsFor(entry?.proofIds,`class:${resource}`,n===3?'NEGATIVE':'POSITIVE','DISPOSABLE'))reasons.push(`MISSING_CLASS_${resource}`);
    }
    if([4,5,6].includes(n)&&(!testsFor(entry?.proofIds,id,'POSITIVE','DISPOSABLE')||!testsFor(entry?.proofIds,id,'NEGATIVE','DISPOSABLE')))reasons.push('MISSING_REAL_AUTHORITY_TESTS');
    if(n===7 && !entry?.proofIds?.some(p=>proofs.get(p)?.kind==='DISPOSABLE'))reasons.push('MISSING_REAL_CI');
    if(n===8 && !['migration:fresh','migration:upgrade'].every(boundary=>testsFor(entry?.proofIds,boundary,'POSITIVE','DISPOSABLE')))reasons.push('MISSING_FRESH_UPGRADE');
    criteria.push({id,text:tenantCriteria[n-1],status:reasons.length?'BLOCKED':'PASS',reasons});
  }
  if((input.criteria??[]).length!==10)fail('EXTRA_OR_MISSING_CRITERIA','criteria');
  if(!callerResults.length)fail('EMPTY_CALLER_INVENTORY','inventory');
  const certified=callerResults.filter(c=>c.verified&&c.kind==='PRIVILEGED_FACTORY').length;
  return {version:1,result:failures.length===0&&criteria.every(c=>c.status==='PASS')?'PASS':'BLOCKED',
    scope:'COMMAND_007_CRITERION_EVIDENCE_NOT_BATCH_OR_PRODUCTION_ACCEPTANCE',
    certifiedScopedPrivilegedCallers:certified,verifiedCandidateBoundaries:callerResults.filter(c=>c.verified).length,
    unresolvedCandidateBoundaries:callerResults.filter(c=>!c.verified).length,criteria,failures,callers:callerResults};
}
