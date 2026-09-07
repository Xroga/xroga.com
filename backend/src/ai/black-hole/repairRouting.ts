/**
 * Failure-specific repair routing.
 *
 * Mechanical repair    -> DeepSeek Flash
 * Normal repair        -> GLM-5.3 Flash
 * Structural/security  -> GLM-5.3
 * Rare escalation      -> Kimi K3
 * Visual repair        -> GLM-5.3 Flash vision
 *
 * Grok never receives repair/write authority.
 */

import type {
  BlackHoleTaskClass,
} from './taskClass.js';

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

export type RepairScope =
  | 'single_file'
  | 'affected_files'
  | 'module'
  | 'project';

export interface RepairRoute {
  readonly failure:
    RepairFailureKind;

  readonly preferredModels:
    readonly string[];

  readonly scope:
    RepairScope;

  readonly taskClass:
    BlackHoleTaskClass;

  readonly needsVision:
    boolean;

  readonly rationale:
    string;
}

const ROUTES: Record<
  RepairFailureKind,
  Omit<
    RepairRoute,
    'failure'
  >
> = {
  type_error: {
    preferredModels: [
      'deepseek_v4_flash',
      'glm_5_3_flash',
    ],

    scope:
      'single_file',

    taskClass:
      'debugging',

    needsVision:
      false,

    rationale:
      'Type diagnostics are local and deterministic, so begin with the cheapest capable repair route.',
  },

  compile_error: {
    preferredModels: [
      'glm_5_3_flash',
      'deepseek_v4_flash',
      'glm_5_3',
    ],

    scope:
      'affected_files',

    taskClass:
      'debugging',

    needsVision:
      false,

    rationale:
      'Compiler failures normally identify the affected surface and should be repaired without regenerating unrelated product code.',
  },

  lint_error: {
    preferredModels: [
      'deepseek_v4_flash',
      'glm_5_3_flash',
    ],

    scope:
      'single_file',

    taskClass:
      'debugging',

    needsVision:
      false,

    rationale:
      'Lint failures are mechanical and should use the lowest-cost capable repair path.',
  },

  test_failure: {
    preferredModels: [
      'glm_5_3_flash',
      'glm_5_3',
    ],

    scope:
      'affected_files',

    taskClass:
      'debugging',

    needsVision:
      false,

    rationale:
      'A failing test identifies a bounded behavior surface; repair that surface before escalating.',
  },

  runtime_error: {
    preferredModels: [
      'glm_5_3_flash',
      'glm_5_3',
    ],

    scope:
      'affected_files',

    taskClass:
      'debugging',

    needsVision:
      false,

    rationale:
      'Runtime failures often require reasoning across a small stack slice but not whole-project regeneration.',
  },

  dependency_error: {
    preferredModels: [
      'glm_5_3',
      'glm_5_3_flash',
      'kimi_k3',
    ],

    scope:
      'project',

    taskClass:
      'debugging',

    needsVision:
      false,

    rationale:
      'Dependency conflicts are project-wide facts and require repository-aware reasoning.',
  },

  structural_failure: {
    preferredModels: [
      'glm_5_3',
      'kimi_k3',
      'glm_5_3_flash',
    ],

    scope:
      'module',

    taskClass:
      'long_horizon_engineering',

    needsVision:
      false,

    rationale:
      'Structural failures require senior repository-scale reasoning, with Kimi reserved for escalation.',
  },

  visual_mismatch: {
    preferredModels: [
      'glm_5_3_flash',
    ],

    scope:
      'affected_files',

    taskClass:
      'vision',

    needsVision:
      true,

    rationale:
      'Visual evidence must be inspected by the confirmed multimodal engineering route before source files are changed.',
  },

  security_finding: {
    preferredModels: [
      'glm_5_3',
      'kimi_k3',
      'glm_5_3_flash',
    ],

    scope:
      'affected_files',

    taskClass:
      'security_review',

    needsVision:
      false,

    rationale:
      'Security repairs must close the vulnerability class and therefore begin with the senior engineering route.',
  },

  deployment_failure: {
    preferredModels: [
      'glm_5_3_flash',
      'glm_5_3',
    ],

    scope:
      'affected_files',

    taskClass:
      'deployment_debugging',

    needsVision:
      false,

    rationale:
      'Deployment failures usually live in configuration, build tooling or infrastructure and should be repaired surgically.',
  },
};

export function routeRepair(
  failure: RepairFailureKind,
): RepairRoute {
  return {
    failure,
    ...ROUTES[failure],
  };
}

export function escalateScope(
  current: RepairScope,
  attempt: number,
): RepairScope {
  if (
    attempt < 3
  ) {
    return current;
  }

  const order:
    RepairScope[] = [
      'single_file',
      'affected_files',
      'module',
      'project',
    ];

  const index =
    order.indexOf(
      current,
    );

  return order[
    Math.min(
      index + 1,
      order.length - 1,
    )
  ];
}

export function classifyFailure(
  message: string,
): RepairFailureKind {
  const text =
    message ?? '';

  if (
    /\bTS\d{4}\b|type\s+error|is not assignable|has no properties in common/i.test(
      text,
    )
  ) {
    return 'type_error';
  }

  if (
    /cannot find module|module not found|unmet peer|version conflict|ERESOLVE/i.test(
      text,
    )
  ) {
    return 'dependency_error';
  }

  if (
    /eslint|prettier|lint(?:ing)?\s+error|no-unused-vars/i.test(
      text,
    )
  ) {
    return 'lint_error';
  }

  if (
    /test(?:s)?\s+failed|assertion|expect\(|✕|✗/i.test(
      text,
    )
  ) {
    return 'test_failure';
  }

  if (
    /visual|screenshot|layout|does not match the design|pixel/i.test(
      text,
    )
  ) {
    return 'visual_mismatch';
  }

  if (
    /vulnerab|cve-|security\s+(?:finding|issue)|injection|xss/i.test(
      text,
    )
  ) {
    return 'security_finding';
  }

  if (
    /deploy(?:ment)?\s+fail|vercel|fly\s+deploy|build\s+command\s+failed/i.test(
      text,
    )
  ) {
    return 'deployment_failure';
  }

  if (
    /syntax\s+error|unexpected\s+token|compil/i.test(
      text,
    )
  ) {
    return 'compile_error';
  }

  if (
    /circular|architecture|too many files|structural/i.test(
      text,
    )
  ) {
    return 'structural_failure';
  }

  return 'runtime_error';
}
