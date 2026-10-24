import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {validateSupplementalOwners} from './supplemental-owners.mjs';
const read=path=>JSON.parse(readFileSync(new URL('../../'+path,import.meta.url),'utf8'));
const plan=()=>read('docs/xroga/research/supplemental-planning-owners.json');
const source=()=>read('docs/command-2/parts-abc/requirements-ledger.json');
const missions=()=>read('docs/xroga/research/derived-original-requirements.json').missions;
test('all eight approved supplemental owners retain exact source scope and remain planning only',()=>{
  const value=validateSupplementalOwners(plan(),source(),missions());assert.equal(value.owners.length,8);
  assert.ok(value.owners.every(o=>o.id.startsWith('SUPP-')&&o.planningStatus==='PLANNED'&&o.implementationStatus==='NOT_IMPLEMENTED'));
  assert.equal(missions().length,72);
});
test('missing duplicate fabricated implemented or arbitrarily scheduled supplemental owners fail closed',()=>{
  for(const mutate of [p=>p.owners.pop(),p=>p.owners[1]=p.owners[0],p=>p.owners[0].id='MISSION-032',
    p=>p.owners[0].sourceRowSha256='0'.repeat(64),p=>p.owners[0].implementationStatus='IMPLEMENTED',
    p=>p.owners[0].roadmapPlacement='BATCH_1_5',p=>p.owners[0].acceptanceCriteria=[],p=>p.authorizesImplementation=true,
    p=>p.originalMissionsModified=true,p=>p.owners[0].existingMissionReview[0].reusedAsDedicatedOwner=true]){
    const value=plan();mutate(value);assert.throws(()=>validateSupplementalOwners(value,source(),missions()));
  }
});
