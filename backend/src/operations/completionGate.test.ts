import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveCommand3BStatus, deriveCommand3FinalStatus, type Command3BRequirement } from './completionGate.js';

const requirement = (overrides: Partial<Command3BRequirement> = {}): Command3BRequirement => ({ id: 'c3b-1', mandatory: true, status: 'verified', evidence: ['test:evidence'], ...overrides });

test('Command 3B status is derived only from evidenced mandatory requirements', () => {
  assert.equal(deriveCommand3BStatus([requirement(), requirement({ id: 'optional', mandatory: false, status: 'external_only', evidence: ['operator action'] })]), 'command_3b_verified');
});
test('missing evidence blocks a mandatory requirement', () => assert.equal(deriveCommand3BStatus([requirement({ evidence: [] })]), 'command_3b_blocked'));
test('manual-looking verified optional state without evidence is rejected', () => assert.equal(deriveCommand3BStatus([requirement(), requirement({ id: 'optional', mandatory: false, evidence: [] })]), 'command_3b_blocked'));
test('complete Command 3 requires evidenced 3B and 3C ledgers', () => {
  assert.deepEqual(deriveCommand3FinalStatus([requirement()], [requirement({ id: 'c3c-1' })]), {
    command3b: 'command_3b_verified', command3c: 'command_3c_verified', complete: 'production_operations_growth_verified',
  });
  assert.equal(deriveCommand3FinalStatus([requirement()], [requirement({ id: 'c3c-1', evidence: [] })]).complete, 'production_operations_growth_blocked');
});
