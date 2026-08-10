import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ENGINEERING_ROLES,
  MUTATION_TOOLS,
  READ_TOOLS,
  RESEARCH_TOOLS,
  RolePermissionError,
  assertToolAllowed,
  isEngineeringRole,
  isMutationTool,
  roleForTaskClass,
  roleMayUseTool,
  type EngineeringRoleId,
} from './engineeringRoles.js';
import { executableTasksFromRoutePlan } from './executionRuntime.js';

/**
 * Command 3 §11A, §29A and §29D — explicit roles and enforced tool boundaries.
 *
 * The invariant with a live precedent is the research boundary. Provider isolation stops a
 * research *model* being selected for coding; these stop a research *role* holding a write
 * tool regardless of which model backs it. Two independent controls over one risk.
 */

const ROLE_IDS = Object.keys(ENGINEERING_ROLES) as EngineeringRoleId[];

test('all fifteen roles of §11A are defined', () => {
  assert.equal(ROLE_IDS.length, 15, ROLE_IDS.join(', '));
});

test('every role declares a responsibility, provider category and completion evidence', () => {
  for (const id of ROLE_IDS) {
    const role = ENGINEERING_ROLES[id];
    assert.ok(role.responsibility.length > 10, `${id} responsibility`);
    assert.ok(['coding', 'research', 'none'].includes(role.providerCategory), `${id} category`);
    assert.ok(role.completionEvidence.length > 0, `${id} must require evidence to complete`);
  }
});

test('the research role holds no repository tool at all, read or write', () => {
  const research = ENGINEERING_ROLES.research;
  for (const tool of [...READ_TOOLS, ...MUTATION_TOOLS]) {
    assert.equal(
      roleMayUseTool('research', tool),
      false,
      `research role was granted repository tool ${tool}`,
    );
  }
  assert.deepEqual([...research.allowedTools].sort(), [...RESEARCH_TOOLS].sort());
});

test('no research-category role may mutate a repository', () => {
  for (const id of ROLE_IDS) {
    if (ENGINEERING_ROLES[id].providerCategory !== 'research') continue;
    for (const tool of ENGINEERING_ROLES[id].allowedTools) {
      assert.equal(isMutationTool(tool), false, `${id} holds mutation tool ${tool}`);
    }
  }
});

test('exactly four roles may change or publish a repository', () => {
  const mutating = ROLE_IDS.filter((id) =>
    ENGINEERING_ROLES[id].allowedTools.some((tool) => isMutationTool(tool)),
  ).sort();
  // A fourth appearing here is a real change in blast radius and should fail loudly
  // rather than pass because the assertion was written loosely.
  assert.deepEqual(mutating, ['github_publishing', 'implementation', 'repair', 'test_generation'].sort());
});

test('reviewers can read the diff but never edit it', () => {
  for (const id of ['independent_review', 'security_review'] as const) {
    for (const tool of MUTATION_TOOLS) {
      assert.equal(roleMayUseTool(id, tool), false, `${id} may use ${tool}`);
    }
    assert.equal(roleMayUseTool(id, 'read_git_diff'), true, `${id} cannot read the diff`);
  }
});

test('deterministic roles take no model opinion', () => {
  for (const id of ['validation_runtime', 'github_publishing', 'deployment', 'completion'] as const) {
    assert.equal(ENGINEERING_ROLES[id].deterministic, true, `${id} should be deterministic`);
    assert.equal(ENGINEERING_ROLES[id].providerCategory, 'none', `${id} should take no model`);
  }
});

test('the publishing controller commits but cannot author files', () => {
  // §13: a model may prepare prose; deterministic tools perform the mutation. The
  // publisher must not be able to introduce content that never passed validation.
  assert.equal(roleMayUseTool('github_publishing', 'commit_verified_changes'), true);
  assert.equal(roleMayUseTool('github_publishing', 'open_pull_request'), true);
  assert.equal(roleMayUseTool('github_publishing', 'write_file'), false);
  assert.equal(roleMayUseTool('github_publishing', 'apply_patch'), false);
});

test('assertToolAllowed refuses by name rather than silently dropping', () => {
  assert.throws(
    () => assertToolAllowed('research', 'write_file'),
    (error: unknown) => {
      assert.ok(error instanceof RolePermissionError);
      assert.match(error.message, /research/);
      assert.match(error.message, /write_file/);
      return true;
    },
  );
  assert.doesNotThrow(() => assertToolAllowed('implementation', 'apply_patch'));
});

test('an unmapped task class gets no role rather than a default one', () => {
  // §29A wants every task to carry an *explicit* role. Defaulting is how a task would
  // acquire tools nobody assigned it.
  assert.equal(roleForTaskClass('some_unknown_class'), null);
  assert.equal(roleForTaskClass('implementation'), 'implementation');
  assert.equal(roleForTaskClass('web_research'), 'research');
});

test('every role a task class maps to actually exists', () => {
  for (const taskClass of ['request_understanding', 'repository_analysis', 'implementation', 'code_review', 'security_review', 'research', 'deployment']) {
    const roleId = roleForTaskClass(taskClass);
    assert.ok(roleId, `${taskClass} has no role`);
    assert.equal(isEngineeringRole(roleId), true, `${roleId} is not a defined role`);
  }
});

test('task classes produced by the planner resolve to roles', () => {
  // Guards the seam between the two modules: a planner emitting a class the role table
  // does not know would produce a task with no explicit role.
  const plan = {
    classification: { requiresCoding: true, requiredCapabilities: ['x'] },
    subtasks: [
      { id: 'a', objective: 'o', taskClass: 'repository_analysis', selectedModel: null, requiredContext: [], allowedFiles: [], expectedOutput: 'e', dependsOn: [], risk: 'low', timeoutMs: 1000, tokenBudget: 100, validation: [], fallbackModels: [], blocker: undefined },
      { id: 'b', objective: 'o', taskClass: 'request_understanding', selectedModel: null, requiredContext: [], allowedFiles: [], expectedOutput: 'e', dependsOn: [], risk: 'low', timeoutMs: 1000, tokenBudget: 100, validation: [], fallbackModels: [], blocker: undefined },
    ],
  } as unknown as Parameters<typeof executableTasksFromRoutePlan>[0];

  const tasks = executableTasksFromRoutePlan(plan);
  assert.equal(tasks.length, 2);
  for (const task of tasks) {
    assert.ok(roleForTaskClass(task.operationType), `${task.operationType} has no role`);
  }
});
