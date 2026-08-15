import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  classifyFailure,
  escalateScope,
  routeRepair,
  type RepairFailureKind,
} from './repairRouting.js';
import { blackHoleModel } from './registry.js';

test('§24\'s three named assignments hold', () => {
  // TypeScript/compiler → K2.7 / Pro
  assert.deepEqual(routeRepair('type_error').preferredModels, ['kimi_k2_7', 'deepseek_v4_pro']);
  // Large structural → GLM / K3
  assert.deepEqual(routeRepair('structural_failure').preferredModels, ['glm_5_2', 'kimi_k3']);
  // Visual mismatch → K3 vision
  const visual = routeRepair('visual_mismatch');
  assert.deepEqual(visual.preferredModels, ['kimi_k3']);
  assert.equal(visual.needsVision, true);
  assert.equal(visual.taskClass, 'vision');
});

test('no repair route names a research model', () => {
  // §12: Grok holds no write authority, so it can never be a repair route.
  const kinds: RepairFailureKind[] = [
    'type_error', 'compile_error', 'lint_error', 'test_failure', 'runtime_error',
    'dependency_error', 'structural_failure', 'visual_mismatch', 'security_finding',
    'deployment_failure',
  ];
  for (const kind of kinds) {
    for (const modelId of routeRepair(kind).preferredModels) {
      const model = blackHoleModel(modelId);
      assert.ok(model, `${modelId} is not in the canonical registry`);
      assert.equal(
        model!.authority.writeProjectFiles,
        true,
        `${modelId} cannot write files but was offered as a repair route for ${kind}`,
      );
    }
  }
});

test('a local failure does not justify regenerating the product', () => {
  // §24's closing rule. Treating a type error as a reason to rebuild is how a trivial failure
  // becomes an expensive one, and how a working feature gets replaced by a differently-broken
  // one because the model regenerated more than it understood.
  assert.equal(routeRepair('type_error').scope, 'single_file');
  assert.equal(routeRepair('lint_error').scope, 'single_file');
  assert.equal(routeRepair('test_failure').scope, 'affected_files');
});

test('a dependency conflict is project-scoped because it genuinely is', () => {
  assert.equal(routeRepair('dependency_error').scope, 'project');
});

test('a mechanical failure does not spend a reasoning model', () => {
  assert.equal(routeRepair('lint_error').preferredModels[0], 'deepseek_v4_flash');
});

test('scope escalation is bounded and earned', () => {
  // Escalating immediately would reintroduce whole-product regeneration with extra steps.
  assert.equal(escalateScope('single_file', 1), 'single_file');
  assert.equal(escalateScope('single_file', 2), 'single_file');
  assert.equal(escalateScope('single_file', 3), 'affected_files');
  assert.equal(escalateScope('affected_files', 3), 'module');
  assert.equal(escalateScope('module', 3), 'project');
  // And stops at the top rather than wrapping.
  assert.equal(escalateScope('project', 9), 'project');
});

test('failures are classified deterministically from their own message', () => {
  // The compiler already stated its category in the first token; spending a model call to
  // rediscover it is waste.
  assert.equal(classifyFailure("TS2345: Argument of type 'string' is not assignable"), 'type_error');
  assert.equal(classifyFailure('Cannot find module "react-dom"'), 'dependency_error');
  assert.equal(classifyFailure('ERESOLVE unable to resolve dependency tree'), 'dependency_error');
  assert.equal(classifyFailure('eslint: no-unused-vars'), 'lint_error');
  assert.equal(classifyFailure('2 tests failed'), 'test_failure');
  assert.equal(classifyFailure('screenshot does not match the design'), 'visual_mismatch');
  assert.equal(classifyFailure('CVE-2024-1234 in transitive dependency'), 'security_finding');
  assert.equal(classifyFailure('Vercel deployment failed: build command failed'), 'deployment_failure');
  assert.equal(classifyFailure('SyntaxError: unexpected token'), 'compile_error');
  assert.equal(classifyFailure('circular import detected across modules'), 'structural_failure');
});

test('an unrecognised failure falls to runtime rather than to the widest scope', () => {
  const kind = classifyFailure('something went wrong');
  assert.equal(kind, 'runtime_error');
  assert.notEqual(routeRepair(kind).scope, 'project');
});

test('every repair route names a task class the router can route', () => {
  const kinds: RepairFailureKind[] = [
    'type_error', 'compile_error', 'lint_error', 'test_failure', 'runtime_error',
    'dependency_error', 'structural_failure', 'visual_mismatch', 'security_finding',
    'deployment_failure',
  ];
  for (const kind of kinds) {
    const route = routeRepair(kind);
    assert.ok(route.taskClass, `${kind} has no task class`);
    assert.ok(route.rationale.length > 20, `${kind} has no explanation`);
  }
});
