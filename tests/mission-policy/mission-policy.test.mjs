import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateMission } from '../../scripts/xroga/mission-policy.mjs';
import { validMission } from './fixtures.mjs';
const fixture=()=>structuredClone(validMission),context={requirementIds:new Set(['XB01-C006']),pathExists:()=>true,goldenStates:{BLOCKED_KNOWN_GAP:12,FAIL:0}};
test('valid scoped mission passes without claiming product/release completion',()=>assert.equal(validateMission(fixture(),context).release,'BLOCKED'));
test('declared schema migration plus staged rollout/rollback passes policy, not DB execution',()=>{
  const value=fixture(),path='supabase/migrations/20261014000000_fixture_policy.sql';value.changedFiles.push(path);value.schemaImpact={changed:true,migrations:[path],rollout:'Expand; test isolated fresh/upgrade; staging before activation',rollback:'Retain legacy path until verified'};
  assert.match(validateMission(value,context).result,/PASS_STRUCTURED_POLICY/);
});
test('security-changing mission with negative tests and blocked release passes safe implementation policy',()=>{
  const value=fixture();value.securityImpact.tenant={changed:true,description:'Owner checks; isolated proof still blocked'};assert.equal(validateMission(value,context).release,'BLOCKED');
});
test('missing tests or missing evidence references cannot be marked complete',()=>{
  const value=fixture();value.tests=[];assert.throws(()=>validateMission(value,context));assert.throws(()=>validateMission(fixture(),{...context,pathExists:()=>false}),/Missing\/unsafe/);
});
test('high-risk change without real rollback fails',()=>{
  const value=fixture();value.risk='high';value.rollback='none';assert.throws(()=>validateMission(value,context),/real rollback/);
});
test('new/replacement control plane without an RFC fails, while explicit reviewed reference is required',()=>{
  const value=fixture();value.architecture.change='new_control_plane';assert.throws(()=>validateMission(value,context),/explicit RFC/);
  value.architecture.rfc='docs/rfc/fixture-reviewed-exception.md';assert.match(validateMission(value,context).result,/PASS/);
});
test('schema change marked no DB impact or undeclared migration fails',()=>{
  const value=fixture();value.changedFiles.push('supabase/migrations/20261014000000_fixture_policy.sql');assert.throws(()=>validateMission(value,context),/no DB impact/);
  value.schemaImpact.changed=true;assert.throws(()=>validateMission(value,context),/migration declaration/);
});
test('credential-like evidence is rejected without echoing the fixed canary',()=>{
  const value=fixture();value.scope='Bearer fixedcredentialcanarynotarealsecret';assert.throws(()=>validateMission(value,context),error=>!String(error).includes('fixedcredentialcanary')&&/Credential-like/.test(String(error)));
});
test('all done with blocked/failed journeys or unverified command manifests fails',()=>{
  const value=fixture();value.claimsFullProductCompletion=true;assert.throws(()=>validateMission(value,context),/blocked\/failed/);
  const batch=fixture();batch.claimsAllBatchCommandsComplete=true;assert.throws(()=>validateMission(batch,context),/All ten/);
  const placeholder=fixture();placeholder.state='VERIFIED_SCOPE';placeholder.placeholderClaimsRemaining=['unimplemented behavior'];assert.throws(()=>validateMission(placeholder,context),/placeholders/);
});
test('security release cannot bypass authenticated/staged gates or invent a live deployment',()=>{
  const value=fixture();value.securityImpact.auth.changed=true;value.release.state='READY_FOR_REVIEW';value.release.blockers=[];assert.throws(()=>validateMission(value,context),/authenticated and staged/);
  const live=fixture();live.state='LIVE_VERIFIED';assert.throws(()=>validateMission(live,context),/verified URL/);
});
test('security-impact omission, absent negative coverage and unsafe references fail deterministically',()=>{
  const missing=fixture();delete missing.securityImpact.egress;assert.throws(()=>validateMission(missing,context));
  const noNegative=fixture();noNegative.securityImpact.egress.changed=true;noNegative.tests[0].negative=false;assert.throws(()=>validateMission(noNegative,context),/negative tests/);
  const escape=fixture();escape.changedFiles=['../outside'];assert.throws(()=>validateMission(escape,context),/Missing\/unsafe/);
});
