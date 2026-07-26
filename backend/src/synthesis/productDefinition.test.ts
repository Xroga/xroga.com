import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { migrateProductDefinition, synthesizeProductDefinition } from './productDefinition.js';

describe('versioned product definition', () => {
  it('derives workflows, tenant permissions and lifecycle rules from behavior', () => {
    const value = synthesizeProductDefinition({
      prompt: 'Build a clinic booking service where patients request appointments, staff approve them, and each clinic tenant is isolated',
      now: new Date('2026-07-26T00:00:00Z'),
    });
    assert.equal(value.schemaVersion, '1.0.0');
    assert.ok(value.criticalWorkflows.length > 0);
    assert.equal(value.tenants.required, true);
    assert.ok(value.permissions.some((permission) => permission.scope === 'tenant'));
    assert.ok(value.lifecycles.some((lifecycle) => lifecycle.transitions.length > 0));
    assert.deepEqual(value.blockchainCapabilities, []);
  });

  it('does not force persistence or a frontend for an explicitly stateless CLI', () => {
    const value = synthesizeProductDefinition({ prompt: 'Create a command line CLI that converts CSV to JSON on stdout only with no database or storage' });
    assert.deepEqual(value.storage, []);
    assert.ok(value.deploymentTargets[0].includes('package'));
  });

  it('migrates a legacy record through the declared schema path', () => {
    const value = migrateProductDefinition({ objective: 'Track equipment inspections', createdAt: '2026-01-01T00:00:00Z' });
    assert.equal(value.schemaVersion, '1.0.0');
    assert.ok(value.assumptions.some((entry) => entry.includes('Migrated')));
  });

  it('redacts credentials before product requirements are persisted', () => {
    const value = synthesizeProductDefinition({ prompt: 'Build a report tool using sk-1234567890123456789012345678901234567890' });
    assert.ok(!JSON.stringify(value).includes('sk-123456789'));
  });
});
