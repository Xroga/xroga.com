import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {tenantCriteria} from '../security/tenant-acceptance.mjs';
import ts from 'typescript';

export const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(resolve(root,p),'utf8').replace(/\r\n/g,'\n');
const hash=t=>createHash('sha256').update(t).digest('hex');
const frozenPath='docs/xroga/batch-1/phases/PHASE-2-FROZEN-WORKLIST.json';
function enclosingText(source,name){
  const ast=ts.createSourceFile('review.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),matches=[];
  const visit=n=>{if((ts.isMethodDeclaration(n)||ts.isFunctionDeclaration(n))&&n.name?.getText(ast)===name)matches.push(n.getText(ast));ts.forEachChild(n,visit);};
  visit(ast);assert.equal(matches.length,1,`Enclosing function is not uniquely identifiable:${name}`);return matches[0];
}
export function assertUnchangedEnclosing(before,after,name){
  assert.equal(enclosingText(before,name),enclosingText(after,name),'Changed duplicate operations need explicit semantic mapping');
}
export function buildPhaseTwo({reviewDecisions}={}){
  const frozen=JSON.parse(read(frozenPath));
  assert.equal(frozen.packets.length,73);
  const historical=frozen.packets.flatMap(p=>p.mapping.map(m=>m.baselineCallerId));
  assert.equal(historical.length,371);assert.equal(new Set(historical).size,371);
  const callers=JSON.parse(read('docs/xroga/security/privileged-callers.json')).callers;
  const byId=new Map(callers.map(c=>[c.id,c]));
  const approved=JSON.parse(execFileSync('git',['show','8a1a0bfa7878603dd488db98568577b2fb1896da:docs/xroga/security/privileged-callers.json'],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024}));
  const previous=new Map(approved.callers.map(c=>[c.id,c]));
  const acceptedPhaseTwo=JSON.parse(execFileSync('git',['show','a21a82029276d38d53c9e17c580a15f57b653fe3:docs/xroga/security/privileged-callers.json'],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024}));
  const decisions=reviewDecisions??JSON.parse(read('docs/xroga/batch-1/phases/PHASE-2-REVIEW-DECISIONS.json'));
  const phase3Delta=JSON.parse(read('docs/xroga/security/phase-three-authority-delta.json'));
  assert.equal(phase3Delta.acceptedPhaseTwoSource,'a21a82029276d38d53c9e17c580a15f57b653fe3');
  const phase3Remappings=new Map((phase3Delta.remappings??[]).map(r=>[r.previousCallerId,r.currentCallerId]));
  const phase3Retired=new Map((phase3Delta.retiredCalls??[]).map(r=>[r.id,r]));
  assert.equal(phase3Remappings.size,(phase3Delta.remappings??[]).length,'Duplicate Phase3 caller remapping');
  assert.equal(phase3Retired.size,(phase3Delta.retiredCalls??[]).length,'Duplicate Phase3 retired caller');
  assert.equal(decisions.scope,'SEMANTIC_PROGRESS_NOT_SECURITY_CERTIFICATION');
  assert.equal(new Set(decisions.decisions.map(d=>d.packetId)).size,decisions.decisions.length);
  const reviewed=new Map(decisions.decisions.map(d=>[d.packetId,d]));
  const remappings=new Map((decisions.callerRemappings??[]).map(r=>[r.previousCallerId,r]));
  assert.equal(remappings.size,(decisions.callerRemappings??[]).length,'Duplicate semantic remapping');
  const retiredRemappings=new Map((decisions.phase3RetiredCallerRemappings??[]).map(r=>[r.previousCallerId,r]));
  assert.equal(retiredRemappings.size,(decisions.phase3RetiredCallerRemappings??[]).length,'Duplicate retired semantic remapping');
  for(const r of retiredRemappings.values()){
    const before=previous.get(r.previousCallerId),decision=reviewed.get(r.reviewPacketId);
    assert.ok(before&&decision&&before.path===r.path&&before.enclosing===r.enclosing&&r.acceptedPhaseTwoSource==='a21a82029276d38d53c9e17c580a15f57b653fe3'
      &&r.reason.length>=80,'Unexplained retired Phase3 caller');
    assert.ok(!callers.some(c=>c.path===r.path&&c.enclosing===r.enclosing&&c.kind===r.kind&&c.target===r.target),
      `Retired Phase3 caller still exists:${r.previousCallerId}`);
  }
  for(const r of remappings.values()){
    const before=previous.get(r.previousCallerId),decision=reviewed.get(r.reviewPacketId);
    assert.ok(before&&decision&&before.path===r.path&&before.enclosing===r.enclosing&&r.reason.length>=40,'Unexplained semantic remapping');
    assert.equal(decision.sourceSha256,hash(read(r.path)),'Changed semantic remapping source');
  }
  for(const d of reviewed.values()){
    assert.ok(frozen.packets.some(p=>p.id===d.packetId),`Unknown review packet:${d.packetId}`);
    assert.ok(['READY','IN_PROGRESS','BLOCKED'].includes(d.executionStatus),'Progress alone cannot certify or close a packet');
    for(const binding of d.relatedSourceBindings??[])assert.equal(hash(read(binding.path)),binding.sha256,`Semantic review source drift:${binding.path}`);
  }
  const packets=frozen.packets.map(p=>{
    const decision=reviewed.get(p.id)??null;
    if(decision?.sourceSha256)assert.equal(hash(read(p.baselinePath)),decision.sourceSha256,`Semantic review source drift:${p.id}`);
    const mapping=p.mapping.map(m=>({...m,currentCallerIds:[...new Set(m.currentCallerIds.flatMap(id=>{
      if(retiredRemappings.has(id))return [];
      if(phase3Retired.has(id)){
        const retired=phase3Retired.get(id);
        assert.ok(retired.reason.length>=80&&!callers.some(c=>c.id===id||
          (c.path===retired.path&&c.enclosing===retired.enclosing&&c.kind===retired.kind&&c.target===retired.target)),
          `Invalid retired Phase3 caller:${id}`);
        return [];
      }
      if(phase3Remappings.has(id)){
        const next=phase3Remappings.get(id);assert.ok(byId.has(next),`Missing remapped Phase3 caller:${next}`);return [next];
      }
      if(byId.has(id))return [id];
      const old=previous.get(id);assert.ok(old,`Missing approved caller provenance:${id}`);
      const oldPeers=approved.callers.filter(c=>c.path===old.path&&c.enclosing===old.enclosing&&c.kind===old.kind&&c.target===old.target).sort((a,b)=>a.line-b.line);
      const acceptedPeers=acceptedPhaseTwo.callers.filter(c=>c.path===old.path&&c.enclosing===old.enclosing&&c.kind===old.kind&&c.target===old.target).sort((a,b)=>a.line-b.line);
      const oldOrdinal=oldPeers.findIndex(c=>c.id===id);
      const acceptedCaller=acceptedPeers[oldOrdinal];
      if(acceptedCaller&&phase3Retired.has(acceptedCaller.id))return [];
      if(acceptedCaller&&phase3Remappings.has(acceptedCaller.id)){
        const next=phase3Remappings.get(acceptedCaller.id);assert.ok(byId.has(next),`Missing remapped accepted Phase2 caller:${next}`);return [next];
      }
      const selector=remappings.get(id)??old;
      let next=callers.filter(c=>c.path===selector.path&&c.enclosing===selector.enclosing&&c.kind===selector.kind&&c.target===selector.target);
      if(selector.currentCallerId)next=next.filter(c=>c.id===selector.currentCallerId);
      if(next.length>1&&!remappings.has(id)){
        // Moving an unchanged method shifts its source-position IDs. Preserve
        // operation order only after byte-identical method and equal peer-count
        // checks. This remaps identity, never certifies its security semantics.
        const before=execFileSync('git',['show',`8a1a0bfa7878603dd488db98568577b2fb1896da:${old.path}`],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024}).replace(/\r\n/g,'\n');
        assertUnchangedEnclosing(before,read(old.path),old.enclosing);
        const peers=approved.callers.filter(c=>c.path===old.path&&c.enclosing===old.enclosing&&c.kind===old.kind&&c.target===old.target).sort((a,b)=>a.line-b.line);
        assert.equal(peers.length,next.length,'Changed duplicate operation count');
        const ordinal=peers.findIndex(c=>c.id===id);assert.ok(ordinal>=0);next=[next.sort((a,b)=>a.line-b.line)[ordinal]];
      }
      assert.equal(next.length,1,`Changed caller needs explicit semantic remapping:${id}`);
      return [next[0].id];
    }))]}));
    for(const extension of decision?.callerExtensions??[]){
      const origin=previous.get(extension.baselineCallerId),current=byId.get(extension.currentCallerId);
      const obligation=mapping.find(m=>m.baselineCallerId===extension.baselineCallerId);
      assert.ok(obligation&&origin&&current&&origin.path===p.baselinePath&&current.path===origin.path
        &&current.enclosing===origin.enclosing&&extension.reason?.length>=40,'New caller lacks its frozen same-method obligation');
      assert.equal(decision.sourceSha256,hash(read(p.baselinePath)),'New caller extension source drift');
      assert.ok(!mapping.some(m=>m.currentCallerIds.includes(current.id)),'Duplicate caller extension');
      obligation.currentCallerIds.push(current.id);
    }
    const ids=[...new Set(mapping.flatMap(m=>m.currentCallerIds))];
    for(const id of ids)assert.ok(byId.has(id),`Unreconciled frozen caller:${id}`);
    return {id:p.id,family:p.family,sourcePath:p.baselinePath,sourceSha256:hash(read(p.baselinePath)),
      baselineCallerIds:p.baselineCallIds,currentCallerIds:ids,mapping,
      state:'EVIDENCE_GAP',executionStatus:decision?.executionStatus??'READY',severity:'UNASSESSED_NOT_AN_EXPLOIT_COUNT',
      semanticProgress:decision,
      actor:{existingTrace:p.actorAndAuthorityTrace,currentSemanticVerification:'PENDING'},
      resourceOwnerParent:p.obligations.find(o=>o.command==='007').invariant,
      actions:p.resourceOperations,
      untrustedInputs:'Caller-supplied IDs and payloads require source tracing; primitive owner strings are not independently issued authority.',
      privilegedBypass:'Service-role SDK may bypass RLS. This identifies a boundary to verify, not a demonstrated exploit.',
      existingGuard:p.actorAndAuthorityTrace,
      proofCandidates:p.existingTestReferences.map(e=>({...e,sourceSha256:hash(read(e.path)),polarity:'NOT_INFERRED_FROM_MARKER',conclusion:'NOT_CERTIFIED'})),
      proofIds:[],
      originalTenantCriteria:p.obligations.find(o=>o.command==='007').criterionIds,
      independentLaterObligations:p.obligations.filter(o=>o.phase>2),
      exit:'Exact source-traced server actor and resource/parent/account binding, actual positive and negative evidence, or justified narrow exception. Do not clear later obligations or infer proof from review counts.'};
  });
  const report={version:1,scope:'PHASE_2_FINITE_OBLIGATIONS_NOT_SECURITY_ACCEPTANCE',
    approvedPhase1Source:'8a1a0bfa7878603dd488db98568577b2fb1896da',
    frozenWorklist:{path:frozenPath,sha256:hash(read(frozenPath)),historicalRecords:371,packets:73,paths:55},
    baselineEvidence:{aggregateRun:'39145128193',disposableRun:'39145128353',migrations:115,securityTests:149,browserTests:3,
      headSource:'8a1a0bfa7878603dd488db98568577b2fb1896da',actualDisposableCheckout:'c34bbad59a8c0d6ab0231db7bd46b20293a8c3be',
      scope:'Prior branch and actual virtual-merge evidence, not head-only disposable proof. Unchanged source and relevant semantics must be established before reuse. Not proof for new edits.'},
    criteria:tenantCriteria.map((text,i)=>({id:`XB01-C007-AC${String(i+1).padStart(2,'0')}`,text,status:'BLOCKED',proofIds:[]})),
    catalogProgress:decisions.catalogReview??null,
    packets,phase3Started:false,productionAuthorized:false,additionalSpend:0};
  return new Map([['docs/xroga/batch-1/phases/PHASE-2-CLOSURE-LEDGER.json',JSON.stringify(report,null,2)+'\n']]);
}
export function main(args=process.argv.slice(2)){
  for(const[path,text]of buildPhaseTwo()){
    if(args.includes('--write')){mkdirSync(dirname(resolve(root,path)),{recursive:true});writeFileSync(resolve(root,path),text);}
    else assert.ok(existsSync(resolve(root,path))&&read(path)===text,`Phase2 register drift:${path}`);
  }
  console.log(JSON.stringify({result:args.includes('--write')?'GENERATED_NOT_ACCEPTANCE':'PASS_FINITE_PHASE_2_REGISTER',packets:73,historicalRecords:371,certifiedByGeneration:0}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
