import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {buildPhaseOne,root} from './phase-one.mjs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';

test('four-phase mapping preserves all104 original criteria and all371 frozen source identities exactly once',()=>{
  const {phase2,scoreboard}=buildPhaseOne();
  assert.equal(scoreboard.length,104);assert.equal(scoreboard.filter(c=>c.phase===1).length,60);
  assert.equal(new Set(scoreboard.map(c=>c.id)).size,104);
  assert.equal(phase2.packets.length,73);assert.equal(phase2.families.reduce((n,f)=>n+f.baselineRecords,0),371);
  const mapped=phase2.packets.flatMap(p=>p.mapping);assert.equal(mapped.length,371);
  assert.equal(new Set(mapped.map(m=>m.baselineCallerId)).size,371);assert.ok(mapped.every(m=>m.currentCallerIds.length));
  assert.ok(phase2.packets.every(p=>p.obligations.some(o=>o.command==='007'&&o.phase===2)));
  assert.ok(phase2.packets.flatMap(p=>p.obligations).filter(o=>o.command==='009').every(o=>o.phase===3));
  assert.ok(phase2.packets.flatMap(p=>p.obligations).filter(o=>o.command==='010').every(o=>o.phase===4));
});

test('Phase1 generator is deterministic and cannot mark fixture success as real tenant acceptance',()=>{
  const a=buildPhaseOne(),b=buildPhaseOne();assert.deepEqual([...a.outputs],[...b.outputs]);
  const actual=JSON.parse(a.outputs.get('docs/xroga/security/tenant-invariant-obligations.json'));
  assert.equal(actual.proofs.length,0);assert.ok(actual.criteria.every(c=>c.status==='BLOCKED'));
  assert.ok(actual.obligations.filter(o=>o.legacyDispositionPreserved==='SCOPED_BOUNDARY').every(o=>o.state==='EVIDENCE_GAP'));
  const baseline=JSON.parse(readFileSync(resolve(root,'docs/xroga/batch-1/phases/PHASE-1-BASELINE.json'),'utf8'));
  assert.equal(baseline.baselineSource,'ea2305700ae5c46ea24f612f9a09fbfcba4161cd');
  assert.equal(baseline.migrations.length,115);assert.equal(baseline.budget.additionalSpend,0);
});

test('committed Phase1 mappings cannot silently drift or omit frozen obligations',()=>{
  for(const[path,content]of buildPhaseOne().outputs){
    assert.equal(readFileSync(resolve(root,path),'utf8').replace(/\r\n/g,'\n'),content,`Phase1 mapping drift:${path}`);
  }
});
test('later caller changes cannot rewrite the founder-approved frozen Phase2 worklist',()=>{
  const path='docs/xroga/batch-1/phases/PHASE-2-FROZEN-WORKLIST.json';
  const approved=execFileSync('git',['show',`8a1a0bfa7878603dd488db98568577b2fb1896da:${path}`],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');
  assert.equal(buildPhaseOne().outputs.get(path),approved);
});

test('current authority deltas cannot rewrite the accepted historical obligation scaffold',()=>{
  const path='docs/xroga/security/tenant-invariant-obligations.json';
  const accepted=execFileSync('git',['show',`a21a82029276d38d53c9e17c580a15f57b653fe3:${path}`],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');
  assert.equal(buildPhaseOne().outputs.get(path),accepted);
  assert.equal(readFileSync(resolve(root,path),'utf8').replace(/\r\n/g,'\n'),accepted);
});
