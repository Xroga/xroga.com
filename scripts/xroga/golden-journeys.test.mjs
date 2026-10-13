import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fixtureContracts } from '../../tests/golden/fixtures/fixtures.mjs';
import { validateGoldenMatrix } from './golden-schema.mjs';
const ids=new Set(JSON.parse(readFileSync(new URL('../../docs/xroga/requirements-ledger.json',import.meta.url),'utf8')).requirements.map(row=>row.requirement_id));
const fixture=()=>({version:'1.0',sourceSha:'a'.repeat(40),scope:'ACCEPTANCE_CONTRACTS_NOT_PRODUCT_COMPLETION',journeys:structuredClone(fixtureContracts)});
test('all twelve stable contracts declare authority/evidence and blocked journeys count as zero passes',()=>{
  const result=validateGoldenMatrix(fixture(),ids);assert.equal(result.journeyStates.BLOCKED_KNOWN_GAP,12);assert.equal(result.journeyStates.PASS,0);assert.equal(result.liveJourneysCertified,0);
});
test('a missing mandatory journey or duplicate fixture cannot inflate coverage',()=>{
  const missing=fixture();missing.journeys.pop();assert.throws(()=>validateGoldenMatrix(missing,ids),/Missing mandatory/);
  const duplicate=fixture();duplicate.journeys[1].fixtureId=duplicate.journeys[0].fixtureId;assert.throws(()=>validateGoldenMatrix(duplicate,ids),/Duplicate/);
});
test('unknown requirement references or invented implementation files fail',()=>{
  const value=fixture();value.journeys[0].requirements.push('INVENTED-REQUIREMENT');assert.throws(()=>validateGoldenMatrix(value,ids),/Unknown journey requirement/);
  assert.throws(()=>validateGoldenMatrix(fixture(),ids,()=>false),/Unverified implementation path/);
});
test('blocked work requires explicit owned missing capability and cannot be converted into PASS',()=>{
  const gap=fixture();gap.journeys[0].blockers=[];assert.throws(()=>validateGoldenMatrix(gap,ids),/no owned/);
  const fake=fixture();fake.journeys[0].state='PASS';assert.throws(()=>validateGoldenMatrix(fake,ids),/independent execution evidence/);
});
test('missing authority or acceptance evidence is rejected at the structured boundary',()=>{
  const authority=fixture();authority.journeys[0].authorityPoints=[];assert.throws(()=>validateGoldenMatrix(authority,ids));
  const evidence=fixture();evidence.journeys[0].verificationEvidence=[];assert.throws(()=>validateGoldenMatrix(evidence,ids));
});
test('cyclic or missing graph dependencies are not an executable expected plan',()=>{
  const cycle=fixture();cycle.journeys[0].planningGraph[0].dependencies=[cycle.journeys[0].planningGraph.at(-1).id];assert.throws(()=>validateGoldenMatrix(cycle,ids),/Cyclic/);
  const missing=fixture();missing.journeys[0].planningGraph[0].dependencies=['missing-node'];assert.throws(()=>validateGoldenMatrix(missing,ids),/Missing graph dependency/);
});
test('using the same fixture tenant for owner and outsider cannot fake isolation',()=>{
  const value=fixture();value.journeys[0].tenant.outsiderId=value.journeys[0].tenant.ownerId;assert.throws(()=>validateGoldenMatrix(value,ids),/actors must differ/);
});
