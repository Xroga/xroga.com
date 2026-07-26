import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCapabilityGraph } from './capabilityGraph.js';
import { classifyCredentialField, createFrameworkAdapterFromVerifiedSource, createProviderAdapter, dependencyInventory, selectArchitecture, selectFrameworkAdapter } from './adapters.js';
import { synthesizeProductDefinition } from './productDefinition.js';

describe('architecture and provider contracts', () => {
  it('selects a minimal CLI architecture without frontend or database', () => {
    const definition = synthesizeProductDefinition({ prompt: 'Create a stateless command line CLI that converts CSV to JSON on stdout only with no database or storage' });
    const architecture = selectArchitecture(definition, buildCapabilityGraph(definition));
    assert.equal(architecture.primary, 'command_line_tool');
    assert.equal(architecture.needsFrontend, false);
    assert.equal(architecture.needsPersistentStorage, false);
    assert.equal(selectFrameworkAdapter(architecture).id, 'node-cli');
  });

  it('selects a full-stack tenant architecture for a clinic workflow', () => {
    const definition = synthesizeProductDefinition({ prompt: 'Build a multi-tenant clinic portal where patients book appointments and staff approve requests' });
    const architecture = selectArchitecture(definition, buildCapabilityGraph(definition));
    assert.equal(architecture.primary, 'full_stack_web_application');
    assert.equal(architecture.tenancy, 'multi_tenant');
  });

  it('never makes a secret browser-visible because of a public-looking prefix', () => {
    assert.equal(classifyCredentialField('NEXT_PUBLIC_PAYMENT_SECRET_KEY').exposure, 'server_only');
    assert.equal(classifyCredentialField('NEXT_PUBLIC_SUPABASE_URL').exposure, 'browser_allowed');
    assert.equal(classifyCredentialField('PROVIDER_WEBHOOK_SECRET').classification, 'webhook_secret');
  });

  it('requires authoritative provider source expiry to be valid', () => {
    assert.throws(() => createProviderAdapter({ id: 'mail', capabilityIds: ['notify'], operations: ['send'], source: { authority: 'https://provider.example/docs', verifiedAt: '2026-08-01', expiresAt: '2026-07-01' } }));
  });

  it('records resolved dependency versions and blocks incompatible licences', () => {
    const inventory = dependencyInventory([{ path: 'package-lock.json', content: JSON.stringify({ packages: { 'node_modules/example-auth': { version: '2.3.4', license: 'AGPL-3.0' } } }) }]);
    assert.equal(inventory.entries[0].version, '2.3.4');
    assert.equal(inventory.entries[0].securityCritical, true);
    assert.ok(inventory.blockers.some((entry) => entry.includes('incompatible licence')));
  });

  it('will not invent an unfamiliar framework adapter without complete verified facts', () => {
    assert.throws(() => createFrameworkAdapterFromVerifiedSource({ id: 'new-runtime', officialSource: 'https://runtime.example/docs', verifiedAt: '2026-07-26', expiresAt: '2026-08-26', requiredFiles: [], buildCommand: '', testCommand: '', productionVerification: [] }));
    const adapter = createFrameworkAdapterFromVerifiedSource({ id: 'new-runtime', officialSource: 'https://runtime.example/docs', verifiedAt: '2026-07-26', expiresAt: '2026-08-26', requiredFiles: ['runtime.toml'], buildCommand: 'runtime build', testCommand: 'runtime test', productionVerification: ['build artifact exists and executes'] });
    assert.equal(adapter.source.reference, 'https://runtime.example/docs');
  });
});
