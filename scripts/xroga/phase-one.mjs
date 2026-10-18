import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseCommandRequirements} from './reconcile-requirements.mjs';
import {tenantCriteria} from '../security/tenant-acceptance.mjs';
import {validatePhaseReceipt,implementationBindingsAtSource,evidencePath} from './verify-phase-one.mjs';

export const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const baseline='ea2305700ae5c46ea24f612f9a09fbfcba4161cd';
const basePath='docs/xroga/batch-1/phases/';
const read=p=>{const text=readFileSync(resolve(root,p),'utf8');return p==='docs/xroga/research/inputs/batch-one-report.txt'?text:text.replace(/\r\n/g,'\n');};
const hash=x=>createHash('sha256').update(x).digest('hex');
const json=x=>JSON.stringify(x,null,2)+'\n';
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trimEnd();
const historical=p=>JSON.parse(git(['show',`${baseline}:${p}`]));
const cid=(n,i)=>`XB01-C${n}-AC${String(i).padStart(2,'0')}`;
const fixtures={
 '001':['scripts/xroga/inventory.test.mjs'],
 '002':['scripts/xroga/requirements.test.mjs','scripts/xroga/private-research.test.mjs'],
 '003':['scripts/ci/baseline.test.mjs','scripts/ci/prepare-pr-integration.test.mjs'],
 '004':['scripts/xroga/runtime-discovery.test.mjs','scripts/xroga/runtime-config.test.mjs'],
 '005':['scripts/xroga/golden-journeys.test.mjs','frontend/e2e/xroga-golden/'],
 '006':['tests/mission-policy/mission-policy.test.mjs'],
};

export function buildPhaseOne(){
  const commands=parseCommandRequirements(read('docs/xroga/research/inputs/batch-one-report.txt'));
  for(const c of commands)assert.equal(c.criteria.length,['009','010'].includes(c.number)?12:10,`Exact original criteria:${c.number}`);
  assert.deepEqual(commands.find(c=>c.number==='007').criteria,tenantCriteria);
  const old=historical('docs/xroga/security/privileged-callers.json'),oldReviews=historical('docs/xroga/security/caller-reviews.json');
  const oldLedger=historical('docs/xroga/security/batch-1-closure-progress.json');
  const current=JSON.parse(read('docs/xroga/security/privileged-callers.json'));
  const reviews=JSON.parse(read('docs/xroga/security/caller-reviews.json'));
  const pending=old.callers.filter(c=>c.review==='REVIEWED_GAP'),groups=oldReviews.reviews.filter(r=>r.disposition==='REVIEWED_GAP');
  assert.equal(pending.length,371);assert.equal(groups.length,73);assert.equal(new Set(pending.map(c=>c.path)).size,55);
  const family=new Map();for(const group of oldLedger.matrix)for(const ids of Object.values(group.callersByPath))for(const id of ids){assert.ok(!family.has(id));family.set(id,group.rootCause);}
  const packets=groups.map(record=>{
    const id=`B1-P2-${hash(record.path+':'+[...record.callIds].sort().join(',')).slice(0,16)}`;
    const mapping=record.callIds.map(oldId=>{
      const before=pending.find(c=>c.id===oldId);assert.ok(before);
      let next=current.callers.filter(c=>c.id===oldId);
      if(!next.length)next=current.callers.filter(c=>c.path===before.path&&c.enclosing===before.enclosing
        &&(c.target===before.target||(['assignExperiment','exposeExperiment'].includes(c.enclosing)&&c.kind==='RPC_CANDIDATE')));
      assert.ok(next.length,`Unmapped baseline caller:${oldId}`);
      return {baselineCallerId:oldId,currentCallerIds:next.map(c=>c.id),change:next.some(c=>c.id===oldId)?'RETAINED':'REPLACED_OR_CONSOLIDATED_NOT_CERTIFICATION'};
    });
    const currentIds=[...new Set(mapping.flatMap(m=>m.currentCallerIds))];
    const groupFamily=family.get(record.callIds[0]);
    const invariants={
      'worker-state':['DURABLE_OWNER_RUN_PROJECT_LINEAGE',[4,5,9]],
      'credentials-oauth':['OWNER_SELECTED_CONNECTION_LINEAGE',[4,6,9]],
      'approvals-external-actions':['OWNED_ACTION_TARGET_AND_REQUESTER',[3,4,9]],
      'billing-budget':['OWNED_PAYMENT_ACCOUNT_AND_BUDGET',[3,4,9]],
      'projects-files-runtime':['OWNED_PARENT_RESOURCE_PERSISTENCE',[3,4,5,9]],
      'growth-community':['PROJECT_TENANT_MEMBER_RELATION',[3,4,9]],
      'other-source-bound-boundaries':['EXACT_SOURCE_CONTEXT_OR_NARROW_EXCEPTION',[3,4,9]],
    };
    const [invariant,criteria]=invariants[groupFamily];
    const obligations=[{id:`${id}:TENANT_SCOPE`,phase:2,command:'007',criterionIds:[2,...criteria,10].map(n=>cid('007',n)),state:'EVIDENCE_GAP',
      invariant,
      existingGuard:record.authority,missingEvidenceOrRisk:record.reason,
      completion:'Reuse exact-source positive/negative proof first. Fix only a demonstrated ownership defect. Every current caller scoped or narrowly exempt.'}];
    if(/credential|oauth|provider|token|vault|keys/i.test(record.path))obligations.push({id:`${id}:CREDENTIAL_CUSTODY`,phase:3,command:'009',criterionIds:[cid('009',1),cid('009',11),cid('009',12)],
      state:record.path.endsWith('/oauthPkceStore.ts')?'CONFIRMED_DEFECT':'EVIDENCE_GAP',
      invariant:'Encrypted custody and consumer migration, distinct from tenant selection',
      evidence:record.path.endsWith('/oauthPkceStore.ts')?'saveOAuthConnection forwards raw OAuth fields to save_oauth_connection; authorization-epoch migration assigns those fields directly':'Existing review, not proof that every credential class is migrated',
      completion:'Original009 vault/migration criteria, not relabeled007 scope closure'});
    if(/businessAction|operationsService|providerBudget|BillingService|billingWebhook/.test(record.path))obligations.push({id:`${id}:ACTION_AUTHORITY`,phase:3,command:'008',criterionIds:[cid('008',4),cid('008',5),cid('008',8)],state:'EVIDENCE_GAP',
      invariant:'Exact account/action/digest/spend/replay and receipts, independently of tenant identity',completion:'Original008 adapter-specific positive/negative evidence'});
    if(/storage|publish|integrations|livePreview/.test(record.path))obligations.push({id:`${id}:EGRESS`,phase:4,command:'010',criterionIds:[cid('010',3),cid('010',12)],state:'EVIDENCE_GAP',
      invariant:'Outbound policy for actual external effects, without inventing an effect at a pure read',completion:'Phase4 actual egress inventory determines applicable adapter, then proves policy or scoped non-applicability'});
    return {id,family:groupFamily,baselinePath:record.path,baselineCallIds:record.callIds,baselineSourceSha256:record.sourceSha256,
      currentCallerIds:currentIds,mapping,classification:'REVIEW_WORKLOAD_NOT_EXPLOIT_COUNT',actorAndAuthorityTrace:record.authority,
      resourceOperations:[...new Set(current.callers.filter(c=>currentIds.includes(c.id)).map(c=>`${c.enclosing}:${c.kind}:${c.target}`))],
      sourceBoundReviewReason:record.reason,existingTestReferences:record.evidence,
      testCoverage:record.evidence.map(e=>({...e,sourceSha256:hash(read(e.path)),polarity:'UNKNOWN_UNTIL_SOURCE_BOUND_PHASE_2_RECONCILIATION'})),obligations,
      dependencies:['B1_P1_VERIFIED','FOUNDER_PHASE_2_ADMISSION'],founderAction:false,additionalSpend:0};
  });
  assert.equal(new Set(packets.flatMap(p=>p.baselineCallIds)).size,371);
  const recorded=existsSync(resolve(root,evidencePath))?JSON.parse(read(evidencePath)):null;
  // Accepted prior-phase evidence remains tied to its immutable source. Later
  // phase edits must not reopen this snapshot or pretend it proves newer code.
  const verified=recorded?validatePhaseReceipt(recorded,implementationBindingsAtSource(recorded.sourceSha)):null;
  const criterionScoreboard=commands.flatMap(command=>command.criteria.map((text,i)=>({id:cid(command.number,i+1),command:command.number,originalText:text,
    contractPath:'docs/xroga/research/inputs/batch-one-report.txt',phase:Number(command.number)<=6?1:command.number==='007'?2:['008','009'].includes(command.number)?3:4,
    status:'BLOCKED',reason:Number(command.number)<=6?'Final-source criterion verification is collected by the phase handoff, not inferred from file presence':'Later phase original requirement remains mandatory',
    implementationEvidence:fixtures[command.number]??[],testType:'FINAL_SOURCE_CI_REQUIRED',proofIds:[],
    ...(verified?.criteria.find(c=>c.id===cid(command.number,i+1))??{})})));
  const phase2={version:1,scope:'FROZEN_PHASE_2_WORKLIST_NOT_TENANT_ACCEPTANCE',baselineSource:baseline,
    historical:{reviewedCandidates:641,unreviewed:0,unresolved:371,compositeReviewEntries:73,paths:55},
    families:oldLedger.matrix.map(g=>({family:g.rootCause,baselineRecords:g.pendingCandidates})),packets,
    admission:['Phase1 founder review','B1_P1_VERIFIED or explicit founder resolution of its exact blockers','No Phase3/4 implementation in Phase2'],
    invariantStates:['CONFIRMED_DEFECT','CREDIBLE_RISK','EVIDENCE_GAP','VERIFIED_BOUNDARY','APPROVED_NARROW_EXCEPTION','NOT_PERSISTENCE','EXTERNAL_BLOCKER','OUT_OF_SCOPE_WITH_PROVENANCE']};
  const obligations=reviews.reviews.map(record=>({id:`OB-${hash(record.path+':'+[...record.callIds].sort().join(',')).slice(0,16)}`,
    callerIds:record.callIds,path:record.path,sourceSha256:record.sourceSha256,
    state:record.disposition==='NOT_PERSISTENCE'?'NOT_PERSISTENCE':'EVIDENCE_GAP',legacyDispositionPreserved:record.disposition,
    criterionIds:[cid('007',2),cid('007',10)],actorOrigin:'UNPROVEN_IN_STRUCTURED_RECEIPT',ownerBinding:'UNPROVEN_IN_STRUCTURED_RECEIPT',
    reason:record.reason,authorityTrace:record.authority,proofIds:[],
    existingEvidence:record.evidence,
    ...(record.disposition==='NOT_PERSISTENCE'?{review:{...record.evidence[0],sha256:hash(read(record.evidence[0].path))}}:{}),
    note:'Existing semantic reviews are preserved. Missing machine-linked proof is an evidence obligation, not a new defect or instruction to rewrite verified code.'}));
  const outputs=new Map([
    [basePath+'PHASE-2-FROZEN-WORKLIST.json',json(phase2)],
    [basePath+'BATCH-1-CRITERION-SCOREBOARD.json',json({version:1,contractSha256:hash(read('docs/xroga/research/inputs/batch-one-report.txt')),scope:'ORIGINAL_WORDING_NO_REQUIREMENT_REMOVED',criteria:criterionScoreboard})],
    ['docs/xroga/security/tenant-invariant-obligations.json',json({version:1,sourceSha:baseline,scope:'STRUCTURED_PROOF_LINKAGE_PENDING_PHASE_2',obligations,
      criteria:tenantCriteria.map((text,i)=>({id:cid('007',i+1),text,status:'BLOCKED',proofIds:[],reason:'Actual original criterion is not certified by Phase1 evaluator fixtures'})),proofs:[]})],
    [basePath+'BATCH-1-FOUR-PHASE-TRACEABILITY.md',`# Original Batch 1 traceability\n\nOriginal report SHA256: \`${hash(read('docs/xroga/research/inputs/batch-one-report.txt'))}\`. Original wording is preserved in BATCH-1-CRITERION-SCOREBOARD.json. No mandatory requirement moves to Batch1.5.\n\n| Phase | Original acceptance ownership | Admission |\n| --- | --- | --- |\n| 1 | 001–006,60 criteria; 007 evaluator only; overlay recovery and frozen mapping | Founder approved Phase1 |\n| 2 | 007,10 actual tenant criteria; frozen371 historical records/73 groups | Founder review after Phase1 |\n| 3 | 008,10 authority criteria; 009,12 vault criteria | Phase2 accepted and founder admission |\n| 4 | 010,12 egress criteria; original final GO/NO-GO; provider decisions | Phase3 accepted and founder admission |\n\nThe synthetic valid evaluator fixture does not satisfy007. The12 blocked product journeys do not fail005's trustworthy-harness stop condition. KMS/R2/schema/commercial hosting remain explicit external or activation gates, never fabricated PASS.\n`],
  ]);
  return {outputs,phase2,scoreboard:criterionScoreboard};
}

export function main(args=process.argv.slice(2)){
  const {outputs,phase2}=buildPhaseOne();
  for(const[path,content]of outputs){if(args.includes('--write')){mkdirSync(dirname(resolve(root,path)),{recursive:true});writeFileSync(resolve(root,path),content);}
    else assert.equal(existsSync(resolve(root,path))?read(path):null,content,`Phase1 source mapping drift:${path}`);}
  console.log(JSON.stringify({result:args.includes('--write')?'GENERATED_NOT_ACCEPTANCE':'PASS_PHASE_1_MAPPING_INTEGRITY_NOT_PHASE_ACCEPTANCE',baselineSource:baseline,
    records:371,packets:phase2.packets.length,criteria:104,laterPhaseWorkStarted:false}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
