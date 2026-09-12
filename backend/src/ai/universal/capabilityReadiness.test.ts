import assert from 'node:assert/strict';
import test from 'node:test';
import { universalCapabilityRegistry } from '../../capabilities/index.js';
import { currentProductTruth } from './productTruth.js';
import { resolveRequestAuthorities } from './semanticRequestPlanner.js';

test('the canonical registry distinguishes authorization, provider availability, and unsupported capabilities', () => {
  const previousParallel = process.env.PARALLEL_API_KEY;
  delete process.env.PARALLEL_API_KEY;
  try {
    const authorities = new Set(['model:execute', 'sandbox:execute']);
    assert.equal(universalCapabilityRegistry.readiness('conversation.respond', authorities).state, 'READY');
    assert.equal(universalCapabilityRegistry.readiness('repository.read', authorities).state, 'AUTH_REQUIRED');
    assert.equal(universalCapabilityRegistry.readiness('research.public-web', authorities).state, 'PROVIDER_UNAVAILABLE');
    assert.equal(universalCapabilityRegistry.readiness('research.x', authorities).state, 'PROVIDER_UNAVAILABLE');
    assert.equal(universalCapabilityRegistry.readiness('arbitrary.future-capability', authorities).state, 'UNSUPPORTED');
  } finally {
    if (previousParallel === undefined) delete process.env.PARALLEL_API_KEY;
    else process.env.PARALLEL_API_KEY = previousParallel;
  }
});

test('Xroga product truth comes from the execution registry and states authorization boundaries', () => {
  const truth = currentProductTruth(new Set(['model:execute', 'sandbox:execute']));
  assert.match(truth, /Conversation response/);
  assert.match(truth, /Repository write.*requires the user-authorized/i);
  assert.match(truth, /Preview is verification evidence/);
  assert.match(truth, /separate from deployment/);
  assert.doesNotMatch(truth, /api[_-]?key\s*=/i);
});

test('repository authority is user-specific and pure conversation performs no GitHub authorization lookup', async () => {
  const projectContext = { repo: 'generated-owner/arbitrary-project', branch: 'topic/isolated', projectRoot: '/' };
  const checked: string[] = [];
  const lookup = async (userId: string) => {
    checked.push(userId);
    return userId === 'authorized-user';
  };

  const withoutProject = await resolveRequestAuthorities({ userId: 'conversation-user' }, lookup);
  assert.equal(withoutProject.has('repository:read'), false);
  assert.deepEqual(checked, []);

  const authorized = await resolveRequestAuthorities({ userId: 'authorized-user', projectContext }, lookup);
  const disconnected = await resolveRequestAuthorities({ userId: 'different-user', projectContext }, lookup);
  assert.equal(authorized.has('repository:read'), true);
  assert.equal(authorized.has('repository:write'), true);
  assert.equal(disconnected.has('repository:read'), false);
  assert.deepEqual(checked, ['authorized-user', 'different-user']);
});
