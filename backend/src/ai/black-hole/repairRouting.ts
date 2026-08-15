/**
 * §24 — routing a repair to the model suited to the failure.
 *
 * §24 gives three assignments: a TypeScript or compiler failure to K2.7 or Pro, a large
 * structural failure to GLM or K3, a visual mismatch to K3 vision plus a coding specialist.
 * The shared instruction underneath them is the last line: *do not regenerate the entire
 * product unnecessarily*.
 *
 * That line is really about scope, not model choice, so this module returns both. A type error
 * on line 42 needs one file and a cheap fast model; treating it as a reason to rebuild the
 * project is how a trivial failure becomes an expensive one — and how a working feature gets
 * replaced by a differently-broken one because the model regenerated more than it understood.
 *
 * The returned chain is a *preference*, not a selection. It is handed to `routeBlackHole` as
 * the task's shape, and that function still applies authority, availability, health and budget.
 * Nothing here can put a model into play that the canonical router would refuse.
 */

import type { BlackHoleTaskClass } from './taskClass.js';

export type RepairFailureKind =
  | 'type_error'
  | 'compile_error'
  | 'lint_error'
  | 'test_failure'
  | 'runtime_error'
  | 'dependency_error'
  | 'structural_failure'
  | 'visual_mismatch'
  | 'security_finding'
  | 'deployment_failure';

/** How much of the product a repair is permitted to touch. */
export type RepairScope = 'single_file' | 'affected_files' | 'module' | 'project';

export interface RepairRoute {
  readonly failure: RepairFailureKind;
  /** Preferred internal models, strongest fit first. Still filtered by the canonical router. */
  readonly preferredModels: readonly string[];
  readonly scope: RepairScope;
  /** The task class to route as, so the repair reuses the normal routing machinery. */
  readonly taskClass: BlackHoleTaskClass;
  readonly needsVision: boolean;
  readonly rationale: string;
}

/**
 * §24's table, with the scope each failure actually justifies.
 *
 * The scopes are the opinionated part. A failing test is `affected_files` rather than `module`
 * because the failure names its own subject; a dependency error is `project` because a version
 * conflict genuinely is a project-wide fact and pretending otherwise produces a fix that breaks
 * a different import.
 */
const ROUTES: Record<RepairFailureKind, Omit<RepairRoute, 'failure'>> = {
  type_error: {
    preferredModels: ['kimi_k2_7', 'deepseek_v4_pro'],
    scope: 'single_file',
    taskClass: 'debugging',
    needsVision: false,
    rationale: 'a type error names its file and line; the fix is local and does not need a flagship',
  },
  compile_error: {
    preferredModels: ['kimi_k2_7', 'deepseek_v4_pro'],
    scope: 'affected_files',
    taskClass: 'debugging',
    needsVision: false,
    rationale: 'compiler diagnostics are precise; the repair follows them rather than re-deriving the design',
  },
  lint_error: {
    preferredModels: ['deepseek_v4_flash', 'kimi_k2_7'],
    scope: 'single_file',
    taskClass: 'debugging',
    needsVision: false,
    rationale: 'a lint violation is mechanical; spending a reasoning model on it is waste',
  },
  test_failure: {
    preferredModels: ['kimi_k2_7', 'deepseek_v4_pro', 'glm_5_2'],
    scope: 'affected_files',
    taskClass: 'debugging',
    needsVision: false,
    rationale: 'a failing test names its subject, so the repair is scoped to what it covers',
  },
  runtime_error: {
    preferredModels: ['deepseek_v4_pro', 'kimi_k2_7', 'glm_5_2'],
    scope: 'affected_files',
    taskClass: 'debugging',
    needsVision: false,
    rationale: 'a stack trace localises the fault but the cause is often one frame above it',
  },
  dependency_error: {
    preferredModels: ['glm_5_2', 'kimi_k3'],
    scope: 'project',
    taskClass: 'debugging',
    needsVision: false,
    rationale: 'a version conflict is a project-wide fact; a local fix breaks a different import',
  },
  structural_failure: {
    preferredModels: ['glm_5_2', 'kimi_k3'],
    scope: 'module',
    taskClass: 'long_horizon_engineering',
    needsVision: false,
    rationale: 'large structural failures need repository-scale comprehension, per §24',
  },
  visual_mismatch: {
    preferredModels: ['kimi_k3'],
    scope: 'affected_files',
    taskClass: 'vision',
    needsVision: true,
    rationale: 'the evidence is an image, so the repair route must genuinely be able to read one',
  },
  security_finding: {
    preferredModels: ['kimi_k3', 'glm_5_2', 'deepseek_v4_pro'],
    scope: 'affected_files',
    taskClass: 'security_review',
    needsVision: false,
    rationale: 'a security fix is judged on whether it closes the class, not the instance',
  },
  deployment_failure: {
    preferredModels: ['deepseek_v4_pro', 'glm_5_2', 'kimi_k3'],
    scope: 'affected_files',
    taskClass: 'deployment_debugging',
    needsVision: false,
    rationale: 'deployment failures live in configuration and infrastructure, rarely in product code',
  },
};

export function routeRepair(failure: RepairFailureKind): RepairRoute {
  return { failure, ...ROUTES[failure] };
}

/**
 * Whether a repair may widen its scope after repeated failure.
 *
 * Escalation is bounded and earned. The first two attempts stay where the evidence points; only
 * a third failure justifies suspecting the surrounding structure. Escalating immediately would
 * reintroduce exactly the whole-product regeneration §24 forbids, just with extra steps.
 */
export function escalateScope(current: RepairScope, attempt: number): RepairScope {
  if (attempt < 3) return current;
  const order: RepairScope[] = ['single_file', 'affected_files', 'module', 'project'];
  const index = order.indexOf(current);
  return order[Math.min(index + 1, order.length - 1)];
}

/**
 * Classifies a validation failure from its message.
 *
 * Deterministic, because the alternative is spending a model call to categorise a compiler
 * error that already stated its own category in the first token.
 */
export function classifyFailure(message: string): RepairFailureKind {
  const text = message ?? '';
  if (/\bTS\d{4}\b|type\s+error|is not assignable|has no properties in common/i.test(text)) return 'type_error';
  if (/cannot find module|module not found|unmet peer|version conflict|ERESOLVE/i.test(text)) return 'dependency_error';
  if (/eslint|prettier|lint(?:ing)?\s+error|no-unused-vars/i.test(text)) return 'lint_error';
  if (/test(?:s)?\s+failed|assertion|expect\(|✕|✗/i.test(text)) return 'test_failure';
  if (/visual|screenshot|layout|does not match the design|pixel/i.test(text)) return 'visual_mismatch';
  if (/vulnerab|cve-|security\s+(?:finding|issue)|injection|xss/i.test(text)) return 'security_finding';
  if (/deploy(?:ment)?\s+fail|vercel|fly\s+deploy|build\s+command\s+failed/i.test(text)) return 'deployment_failure';
  if (/syntax\s+error|unexpected\s+token|compil/i.test(text)) return 'compile_error';
  if (/circular|architecture|too many files|structural/i.test(text)) return 'structural_failure';
  return 'runtime_error';
}
