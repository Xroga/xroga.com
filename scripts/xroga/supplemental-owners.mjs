import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const supplementalOwnerIds=Object.freeze({
  'C2B-005':'SUPP-CHAIN-RPC-FOUNDATIONS',
  'C2C-001':'SUPP-WEB3-CAPABILITY-GRAPH',
  'C2C-003':'SUPP-EVM-INTEGRATION',
  'C2C-004':'SUPP-SOLANA-INTEGRATION',
  'C2C-005':'SUPP-NON-EVM-ADAPTERS',
  'C2C-006':'SUPP-WALLET-SIGNING-SECURITY',
  'C2C-007':'SUPP-HACKATHON-EXECUTION',
  'C2C-008':'SUPP-MAINNET-DEPLOYMENT-EVIDENCE',
});
export const sourceRowHash=row=>createHash('sha256').update(JSON.stringify(row)).digest('hex');

export function validateSupplementalOwners(plan,source,missions){
  assert.equal(plan.version,1);assert.equal(plan.authority,'FOUNDER_EXPLICIT_PLANNING_APPROVAL_2026-10-18');
  assert.equal(plan.originalMissionsModified,false);assert.equal(plan.authorizesImplementation,false);
  assert.equal(plan.owners.length,8);const seen=new Set();
  for(const owner of plan.owners){
    assert.equal(owner.id,supplementalOwnerIds[owner.sourceRowId]);assert.ok(!seen.has(owner.sourceRowId));seen.add(owner.sourceRowId);
    const row=source.requirements.find(r=>r.id===owner.sourceRowId);assert.ok(row);
    assert.equal(owner.sourcePath,'docs/command-2/parts-abc/requirements-ledger.json');
    assert.equal(owner.sourceRowSha256,sourceRowHash(row));assert.equal(owner.scope.title,row.sourceSection);
    assert.deepEqual(owner.scope.sourceTests,row.tests);assert.deepEqual(owner.scope.sourceEvidenceClaims,row.evidence);
    assert.equal(owner.scope.externalBlocker,row.blocker);
    assert.equal(owner.planningStatus,'PLANNED');assert.equal(owner.implementationStatus,'NOT_IMPLEMENTED');
    assert.equal(owner.roadmapPlacement,'PENDING_ROADMAP_RECONCILIATION');
    assert.ok(owner.acceptanceCriteria.length>=row.tests.length);
    for(const name of row.tests)assert.ok(owner.acceptanceCriteria.includes(`Source-required verification: ${name}`));
    assert.ok(owner.dependencies.includes('XB01-C007'));assert.ok(owner.dependencies.includes('XB01-C008'));
    assert.ok(owner.existingMissionReview.length);
    for(const review of owner.existingMissionReview){const mission=missions.find(m=>m.number===review.number);assert.ok(mission);
      assert.equal(review.title,mission.title);assert.equal(review.reusedAsDedicatedOwner,false);assert.ok(review.reason.length>40);}
  }
  assert.deepEqual([...seen].sort(),Object.keys(supplementalOwnerIds).sort());return plan;
}
