import { evaluateTenantAcceptance } from './tenant-acceptance.mjs';
import { createHash } from 'node:crypto';
const dispositions=new Set(['SCOPED_BOUNDARY','NARROW_EXCEPTION','NOT_PERSISTENCE','REVIEWED_GAP']);
const validPath=value=>typeof value==='string'&&/^(?:backend|frontend|scripts|supabase)\//.test(value)&&!value.split('/').includes('..')&&!value.includes('\\');
const obligationId=(path,ids)=>`OB-${createHash('sha256').update(path+':'+[...ids].sort().join(',')).digest('hex').slice(0,16)}`;

/** Manual subset dispositions may change without renaming their original proof
 * container. Exact partition checks preserve every caller and every open scope.
 * These records still receive no structured PASS from their manual disposition.
 */
export function structuredCallerReviewRecords(registry) {
  const groups=new Map(),seen=new Set();
  for(const record of registry.reviews){
    for(const id of record.callIds){if(seen.has(id))throw new Error('Duplicate current caller in structured review partition');seen.add(id);}
    const origin=record.structuredOrigin;
    if(origin&&(!Array.isArray(origin.callIds)||!origin.callIds.length||new Set(origin.callIds).size!==origin.callIds.length
      ||origin.id!==obligationId(record.path,origin.callIds)||origin.disposition!=='REVIEWED_GAP'
      ||record.callIds.some(id=>!origin.callIds.includes(id))))throw new Error('Invalid structured caller lineage');
    const id=origin?.id??obligationId(record.path,record.callIds),group=groups.get(id);
    if(group){
      if(!origin||group.path!==record.path||group.sourceSha256!==record.sourceSha256
        ||JSON.stringify([...group.structuredOrigin.callIds].sort())!==JSON.stringify([...origin.callIds].sort())
        ||group.structuredOrigin.disposition!==origin.disposition)throw new Error('Conflicting structured caller lineage');
      group.parts.push(record);
    }else groups.set(id,{...record,id,parts:[record]});
  }
  return [...groups.values()].map(group=>{
    if(!group.structuredOrigin)return {...group,legacyDisposition:group.disposition};
    const ids=group.parts.flatMap(p=>p.callIds),origin=group.structuredOrigin;
    if(ids.length!==origin.callIds.length||[...origin.callIds].some(id=>!ids.includes(id)))throw new Error('Incomplete structured caller partition');
    const evidence=[...new Map(group.parts.flatMap(p=>p.evidence).map(e=>[`${e.path}:${e.marker}`,e])).values()];
    return {...group,callIds:origin.callIds,legacyDisposition:origin.disposition,
      reason:'Current manual subsets preserve their original structured caller container. Manual outcomes do not issue a source-bound security certificate. Every original007 obligation still requires authenticated structured positive and negative proof.',
      authority:[...new Set(group.parts.map(p=>p.authority))].join('\n'),evidence,
      manualPartitions:group.parts.map(p=>({callIds:p.callIds,disposition:p.disposition}))};
  });
}

/** Audit evidence only. This never issues credentials, roles or a tenant context. */
export function applyCallerReviews(candidates,registry,readEvidence) {
  if(registry?.version!=='1.0'||!Array.isArray(registry.reviews))throw new Error('Invalid manual caller registry');
  const byId=new Map(candidates.map(row=>[row.id,row]));
  if(byId.size!==candidates.length)throw new Error('Duplicate persistence candidate identity');
  const reviews=new Map();
  for(const record of registry.reviews) {
    if(!validPath(record.path)||!/^[a-f0-9]{64}$/.test(record.sourceSha256??'')||!dispositions.has(record.disposition)
      ||!Array.isArray(record.callIds)||!record.callIds.length||typeof record.reason!=='string'||record.reason.length<40
      ||typeof record.authority!=='string'||record.authority.length<40||!Array.isArray(record.evidence)||!record.evidence.length)throw new Error('Incomplete semantic caller review');
    for(const proof of record.evidence) {
      if(!validPath(proof.path)||typeof proof.marker!=='string'||proof.marker.length<10)throw new Error('Invalid review evidence reference');
      const source=readEvidence(proof.path);
      if(typeof source!=='string'||!source.includes(proof.marker))throw new Error(`Unavailable review evidence: ${proof.path}`);
    }
    for(const id of record.callIds) {
      const candidate=byId.get(id);
      if(!candidate||candidate.path!==record.path||candidate.sourceSha256!==record.sourceSha256)throw new Error(`Stale or unknown caller review: ${record.path}`);
      if(reviews.has(id))throw new Error('Duplicate manual caller review');
      reviews.set(id,record);
    }
  }
  return candidates.map(candidate=>{
    const record=reviews.get(candidate.id);
    return record?{...candidate,review:record.disposition,semanticReview:{authority:record.authority,reason:record.reason,evidence:record.evidence}}:candidate;
  });
}

/** One computed relationship between the existing manual and structured records.
 * This does not promote reviews, authenticate receipts or replace either gate.
 * The CLI authenticates observations before supplying the evaluator environment.
 */
export function evaluateCallerClosure(callers,admission,environment) {
  const structured=evaluateTenantAcceptance({...admission,callers},environment);
  const byId=new Map(structured.callers.map(c=>[c.id,c]));
  const obligations=new Map((admission.obligations??[]).map(o=>[o.id,o]));
  const rows=callers.map(caller=>{
    const result=byId.get(caller.id),records=(result?.obligations??[]).map(id=>obligations.get(id)).filter(Boolean);
    const unresolvedManual=['REVIEW_REQUIRED','REVIEWED_GAP'].includes(caller.review)||!dispositions.has(caller.review);
    const states=records.map(o=>o.state);
    const compatible=caller.review==='SCOPED_BOUNDARY'?states.length>0&&states.every(s=>s==='VERIFIED_BOUNDARY')
      :caller.review==='NARROW_EXCEPTION'?states.includes('APPROVED_NARROW_EXCEPTION')&&states.every(s=>['APPROVED_NARROW_EXCEPTION','VERIFIED_BOUNDARY'].includes(s))
      :caller.review==='NOT_PERSISTENCE'?states.length>0&&states.every(s=>s==='NOT_PERSISTENCE'):false;
    const structuredVerified=result?.verified===true;
    return {id:caller.id,path:caller.path,sourceSha256:caller.sourceSha256,manualDisposition:caller.review,
      structuredObligationIds:result?.obligations??[],structuredStates:states,
      criterionIds:[...new Set(records.flatMap(o=>o.criterionIds??[]))].sort(),
      structuredVerified,unresolvedManual,dispositionSupported:!unresolvedManual&&compatible&&structuredVerified,
      state:unresolvedManual?(structuredVerified?'VERIFIED_PROOF_AWAITING_MANUAL_SCOPE_RECONCILIATION':'UNRESOLVED_TENANT_SCOPE')
        :!structuredVerified?'MANUAL_DISPOSITION_AWAITING_STRUCTURED_PROOF':!compatible?'MANUAL_PROOF_KIND_MISMATCH':'AGREED_VERIFIED_SCOPE'};
  });
  const unresolvedManual=rows.filter(r=>r.unresolvedManual).map(r=>r.id);
  const unsupported=rows.filter(r=>!r.unresolvedManual&&!r.dispositionSupported).map(r=>r.id);
  const agreementBlocked=unresolvedManual.length>0||unsupported.length>0;
  const manualCriteria=new Set(rows.filter(r=>!r.dispositionSupported).flatMap(r=>r.criterionIds));
  if(agreementBlocked)for(const id of ['XB01-C007-AC02','XB01-C007-AC10'])manualCriteria.add(id);
  const acceptance={...structured,
    result:structured.result==='PASS'&&!agreementBlocked?'PASS':'BLOCKED',
    criteria:structured.criteria.map(c=>agreementBlocked&&manualCriteria.has(c.id)
      ?{...c,status:'BLOCKED',reasons:[...c.reasons,...(unresolvedManual.length?['UNRESOLVED_MANUAL_TENANT_REVIEW']:[]),...(unsupported.length?['UNSUPPORTED_MANUAL_DISPOSITION']:[])]}:c),
    failures:[...structured.failures,...unresolvedManual.map(id=>({code:'UNRESOLVED_MANUAL_TENANT_REVIEW',id})),...unsupported.map(id=>({code:'UNSUPPORTED_MANUAL_DISPOSITION',id}))]};
  return {structured,acceptance,rows,counts:{currentCallers:rows.length,structuredVerified:rows.filter(r=>r.structuredVerified).length,
    structuredUnproven:rows.filter(r=>!r.structuredVerified).length,manualUnresolved:unresolvedManual.length,
    manualUnsupported:unsupported.length,agreedVerified:rows.filter(r=>r.dispositionSupported).length,
    proofAwaitingManualReconciliation:rows.filter(r=>r.unresolvedManual&&r.structuredVerified).length}};
}
