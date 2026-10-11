import assert from 'node:assert/strict';
import test from 'node:test';
import { FOUNDER_DEMO_FLOW, LAB_SCENARIOS, labPublicMessage, labStatusAt, labTerminalStatus } from './osFounderLab';

test('founder fixtures are deterministic and cover all required failure families', () => {
  assert.equal(LAB_SCENARIOS.length, 41);
  assert.equal(new Set(LAB_SCENARIOS.map((item) => item.id)).size, LAB_SCENARIOS.length);
  for (const id of ['happy-path','empty-result','approval-denied','provider-timeout','selector-failure','workflow-cycle','budget-exhausted','storage-quota','code-test-failure','missing-license','false-success','secret-candidate','cross-tenant','diagnostics-unavailable','permission-denied']) {
    assert.ok(LAB_SCENARIOS.some((item) => item.id === id), id);
  }
  assert.deepEqual(FOUNDER_DEMO_FLOW.map((step) => step.id), ['pain','repository','license','experiment','decision']);
});

test('no scenario can claim verified without passing recorded example evidence', () => {
  for (const scenario of LAB_SCENARIOS) {
    const final = labTerminalStatus(scenario);
    if (final === 'verified') {
      assert.ok(scenario.evidence.length > 0, scenario.id);
      assert.equal(scenario.evidencePassed, true, scenario.id);
    }
    assert.deepEqual([0,1,2,3].map((step) => labStatusAt(scenario, step)), [
      'queued','running',labStatusAt(scenario, 2),final,
    ]);
    const message = labPublicMessage(scenario);
    assert.match(message.saved, /local demo state/);
    assert.match(message.remaining, /evidence/);
    assert.match(message.reference, /^DEMO-/);
    assert.doesNotMatch(JSON.stringify(message), /token|stack trace|password|provider key/i);
  }
  const falseSuccess = LAB_SCENARIOS.find((item) => item.id === 'false-success')!;
  assert.equal(falseSuccess.requestedStatus, 'verified');
  assert.equal(labTerminalStatus(falseSuccess), 'blocked');
});
