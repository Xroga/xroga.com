import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {buildPhaseTwo,root} from './phase-two.mjs';
test('Phase2 retains all73 packets and371 historical identities without certifying reviews or later scope',()=>{
  const [path,text]=[...buildPhaseTwo()][0],r=JSON.parse(text);
  assert.equal(r.packets.length,73);assert.equal(new Set(r.packets.map(p=>p.id)).size,73);
  assert.equal(new Set(r.packets.flatMap(p=>p.baselineCallerIds)).size,371);
  assert.ok(r.packets.every(p=>p.state==='EVIDENCE_GAP'&&p.proofIds.length===0));
  assert.ok(r.packets.flatMap(p=>p.independentLaterObligations).every(o=>o.phase>2));
  assert.ok(r.criteria.every(c=>c.status==='BLOCKED'));assert.equal(r.criteria.length,10);
  assert.equal(r.packets.filter(p=>p.semanticProgress).length,2);
  assert.ok(r.packets.filter(p=>p.semanticProgress).every(p=>p.executionStatus==='IN_PROGRESS'&&p.state==='EVIDENCE_GAP'));
  assert.equal(r.phase3Started,false);assert.equal(r.additionalSpend,0);
  assert.equal(readFileSync(resolve(root,path),'utf8').replace(/\r\n/g,'\n'),text);
});
