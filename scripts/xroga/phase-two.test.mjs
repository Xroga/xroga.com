import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {buildPhaseTwo,assertUnchangedEnclosing,root} from './phase-two.mjs';
test('Phase2 retains all73 packets and371 historical identities without certifying reviews or later scope',()=>{
  const [path,text]=[...buildPhaseTwo()][0],r=JSON.parse(text);
  assert.equal(r.packets.length,73);assert.equal(new Set(r.packets.map(p=>p.id)).size,73);
  assert.equal(new Set(r.packets.flatMap(p=>p.baselineCallerIds)).size,371);
  assert.ok(r.packets.every(p=>p.state==='EVIDENCE_GAP'&&p.proofIds.length===0));
  assert.ok(r.packets.flatMap(p=>p.independentLaterObligations).every(o=>o.phase>2));
  assert.ok(r.criteria.every(c=>c.status==='BLOCKED'));assert.equal(r.criteria.length,10);
  assert.equal(r.packets.filter(p=>p.semanticProgress).length,13);
  const bundle=r.packets.find(p=>p.id==='B1-P2-8c13793907db3388');
  assert.equal(bundle.baselineCallerIds.length,18);
  assert.equal(bundle.currentCallerIds.length,18,'The bundle read repair retains every original persistence obligation');
  assert.match(bundle.semanticProgress.finding,/ORPHAN_AUTHORITY_FIXED_PENDING/);
  assert.ok(r.packets.filter(p=>p.semanticProgress).every(p=>p.executionStatus==='IN_PROGRESS'&&p.state==='EVIDENCE_GAP'));
  const identity=JSON.parse(readFileSync(resolve(root,'docs/xroga/security/privileged-callers.json'),'utf8')).callers.find(c=>c.path==='backend/src/growth/growthService.ts'&&c.target==='link_growth_identity');
  const oldIdentity=r.packets.flatMap(p=>p.mapping).filter(m=>m.currentCallerIds.includes(identity.id));
  assert.equal(oldIdentity.length,2,'Both original insert and refresh obligations survive atomic consolidation');
  const event=JSON.parse(readFileSync(resolve(root,'docs/xroga/security/privileged-callers.json'),'utf8')).callers.find(c=>c.path==='backend/src/growth/growthService.ts'&&c.target==='record_growth_event');
  assert.equal(r.packets.flatMap(p=>p.mapping).filter(m=>m.currentCallerIds.includes(event.id)).length,2,'Both original event insert and conflict-winner obligations survive the transaction');
  const billing=r.packets.find(p=>p.id==='B1-P2-a582cdd6898c81f0');
  assert.equal(billing.baselineCallerIds.length,9);assert.equal(billing.currentCallerIds.length,10);
  assert.equal(billing.mapping.find(m=>m.baselineCallerId==='e7b9dbdcf629027dc864').currentCallerIds.length,3,'New receipt reads retain their original authority obligation');
  assert.equal(r.phase3Started,false);assert.equal(r.additionalSpend,0);
  assert.notEqual(r.baselineEvidence.headSource,r.baselineEvidence.actualDisposableCheckout,'Historical virtual-merge evidence cannot be relabeled as a head-only checkout');
  assert.equal(readFileSync(resolve(root,path),'utf8').replace(/\r\n/g,'\n'),text);
});
test('Phase2 semantic progress rejects changed source, unknown or duplicate packets and self-certified status',()=>{
  const original=JSON.parse(readFileSync(resolve(root,'docs/xroga/batch-1/phases/PHASE-2-REVIEW-DECISIONS.json'),'utf8'));
  for(const mutate of [r=>r.decisions[0].sourceSha256='0'.repeat(64),r=>r.decisions[0].packetId='unknown',
    r=>r.decisions.push(r.decisions[0]),r=>r.decisions[0].executionStatus='CLOSED',
    r=>r.decisions.find(d=>d.relatedSourceBindings).relatedSourceBindings[0].sha256='0'.repeat(64),
    r=>r.callerRemappings[0].reason='unproven',
    r=>r.callerRemappings[0].currentCallerId='not-a-current-call',
    r=>r.decisions.find(d=>d.callerExtensions).callerExtensions[0].currentCallerId='not-a-current-call',
    r=>r.decisions.find(d=>d.callerExtensions).callerExtensions[0].baselineCallerId='not-an-original-obligation']){
    const next=structuredClone(original);mutate(next);assert.throws(()=>buildPhaseTwo({reviewDecisions:next}));
  }
});
test('shifted duplicate caller remapping requires a unique byte-identical method rather than matching syntax labels alone',()=>{
  const source='class Store{ save(){db.from("a");db.from("a");} }';
  assert.doesNotThrow(()=>assertUnchangedEnclosing(source,'\n\n'+source,'save'));
  assert.throws(()=>assertUnchangedEnclosing(source,source.replace('"a"','"foreign"'),'save'));
  assert.throws(()=>assertUnchangedEnclosing(source,'class Store{save(){}} class Other{save(){}}','save'));
  assert.throws(()=>assertUnchangedEnclosing(source,'class Store{}','save'));
});
test('both baseline jobs reject stale Phase2 evidence hashes before browser installation and the unchanged full suites',()=>{
  const workflow=readFileSync(resolve(root,'.github/workflows/unit-tests.yml'),'utf8');
  const jobs=workflow.slice(workflow.indexOf('jobs:')).split(/\r?\n  integrated-candidate:/);
  assert.equal(jobs.length,2);
  for(const job of jobs){
    const check=job.indexOf('node scripts/xroga/phase-two.mjs');
    assert.ok(check>=0);assert.ok(check<job.indexOf('run: npx playwright install'));
    assert.ok(check<job.indexOf('npm run verify:baseline'));
    const inventory=job.indexOf('node scripts/xroga/inventory.mjs --check');
    assert.ok(inventory>check&&inventory<job.indexOf('run: npx playwright install'),'Reject source inventory drift before browser installation and full regression');
    assert.equal(job.match(/npm run verify:baseline/g)?.length,2,'Both complete baseline repetitions remain mandatory');
  }
});
