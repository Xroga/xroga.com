import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
const handoff = read('docs/xroga/batch-1/phases/phase-4/PHASE-4-FROZEN-WORKLIST.json');
const scoreboard = read('docs/xroga/batch-1/phases/BATCH-1-CRITERION-SCOREBOARD.json');
const original = scoreboard.criteria.filter(record => /^XB01-C010-AC\d{2}$/.test(record.id));

assert.equal(handoff.scope, 'PHASE4_HANDOFF_ONLY_COMMAND010_NOT_IMPLEMENTATION_OR_ADMISSION');
assert.equal(handoff.command, '010');
assert.equal(original.length, 12);
assert.equal(handoff.criteria.length, 12);
assert.deepEqual(handoff.criteria.map(({ id, originalText }) => ({ id, originalText })),
  original.map(({ id, originalText }) => ({ id, originalText })));
assert.ok(handoff.criteria.every(record => record.status === 'PLANNED_NOT_IMPLEMENTED'));
assert.deepEqual(handoff.restrictions, { phase4Started: false, additionalSpend: 0, merge: false,
  deploy: false, dnsChange: false, liveProviderEffect: false });
assert.ok(handoff.reusedInterfaces.length >= 8);

console.log(JSON.stringify({ result: 'PASS_PHASE4_HANDOFF_NOT_IMPLEMENTATION_AUTHORIZATION', criteria: 12,
  phase3Status: handoff.phase3Status }));
