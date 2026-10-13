import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseCoverage,validateDerivedResearch,deriveResearch } from './import-private-research.mjs';
const data=()=>JSON.parse(readFileSync(new URL('../../docs/xroga/research/derived-original-requirements.json',import.meta.url),'utf8'));
test('pinned import contains all original unverified rows and concordant mission requirements, not completion claims',()=>{
  const snapshot=validateDerivedResearch(data());
  assert.equal(snapshot.features.length,119);assert.equal(snapshot.missions.length,72);assert.equal(snapshot.originals_committed,false);
  assert.ok(snapshot.features.every(item=>item.evidence_ref==='' && item.owner==='' && item.mission_ref==='' && item.test_result==='NOT_RUN'));
  assert.ok(snapshot.missions.every(item=>item.implementation_verified===false));
  assert.equal(snapshot.sources.filter(item=>item.ingestion==='HASH_VERIFIED_SEMANTIC_REVIEW_PENDING').length,2);
  assert.ok(snapshot.candidates.every(item=>item.admission==='RESEARCH_ONLY_NOT_ADOPTED'));
});
test('tampering with feature title, owner, mission acceptance or hash cannot silently pass CI',()=>{
  for(const mutate of [v=>v.features[0].feature='invented',v=>v.features[0].observed_state='PASS',v=>v.features[0].assessor_primary_mission=1,v=>v.missions[0].acceptance='invented',v=>v.sources[0].sha256='0'.repeat(64),v=>v.missions.pop()]) {
    const copy=data();mutate(copy);assert.throws(()=>validateDerivedResearch(copy),/integrity mismatch/);
  }
});
test('original missing bytes fail closed and cannot produce a fabricated export',()=>{
  assert.throws(()=>deriveResearch(()=>Buffer.from('missing source')),/integrity mismatch/);
});
test('coverage parser retains empty original fields and rejects missing or misleading rows',()=>{
  const snapshot=data(),columns=['group','feature','observed_state','evidence_ref','owner','mission_ref','acceptance_test','test_result','notes'];
  const csv=[columns.join(','),...snapshot.features.map(row=>columns.map(name=>row[name]).join(','))].join('\n');
  assert.equal(parseCoverage(csv).length,119);
  assert.throws(()=>parseCoverage(csv.replace('UNVERIFIED','PASS')),/status/);
  assert.throws(()=>parseCoverage(csv.split('\n').slice(0,-1).join('\n')),/incomplete/);
});
