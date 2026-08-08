/**
 * Turning a request into criteria something can actually check.
 *
 * §17 bans "App works." The reason is not style. A criterion that cannot fail is
 * indistinguishable from no criterion, so a build that generated nothing would satisfy it
 * just as well as one that worked — which makes the final "verified" claim meaningless
 * rather than merely vague.
 *
 * A usable criterion names an observable and a way to observe it. "Bookings persist" is
 * checkable; "the booking system is good" is not. So each criterion here carries the
 * surface that produced it and the kind of test that would settle it, and anything that
 * cannot name both does not get emitted.
 *
 * Criteria come from surfaces rather than from product categories, which is what keeps
 * this open. A CLI gets exit-code and argument criteria because CLIs have those, not
 * because the word "CLI" appeared — so a surface nobody anticipated yields the generic
 * criteria for its declared behaviour and an honest note that nothing more specific is
 * known, rather than silence or a template for the wrong product.
 */

import type { ProductSurface, UniversalProductSpec } from './universalProductSpec.js';
import type { ArchitecturePlan } from './architecturePlan.js';

export type AcceptanceKind =
  | 'unit' | 'integration' | 'api' | 'cli' | 'build' | 'package'
  | 'database' | 'permission' | 'browser' | 'contract' | 'manual';

export interface AcceptanceCriterion {
  readonly id: string;
  readonly statement: string;
  readonly surface: ProductSurface | null;
  readonly kind: AcceptanceKind;
  /** What must be observed for this to pass. */
  readonly observable: string;
  readonly required: boolean;
  /** Set when only a person can settle it, so it is never counted as automated. */
  readonly manualReason?: string;
}

interface Template {
  readonly statement: string;
  readonly kind: AcceptanceKind;
  readonly observable: string;
  readonly required?: boolean;
}

/**
 * Criteria per surface, phrased as observations.
 *
 * Each one names something a test can watch. Where a surface implies a step only a person
 * can complete — store review, mainnet deployment — the criterion is marked manual instead
 * of being dropped, because dropping it would let a run claim completeness it has not
 * reached.
 */
const BY_SURFACE: Readonly<Record<string, readonly Template[]>> = {
  cli: [
    { statement: 'Documented arguments parse and produce the described output', kind: 'cli', observable: 'the binary exits 0 and writes the expected content for a known input' },
    { statement: 'Invalid arguments fail predictably rather than crashing', kind: 'cli', observable: 'a non-zero exit code and a message naming the problem' },
    { statement: 'Exit codes distinguish success from failure', kind: 'cli', observable: 'exit 0 on success and non-zero on every handled error path' },
    { statement: 'The build produces a runnable artefact', kind: 'build', observable: 'the artefact exists at the path the adapter declares' },
  ],
  api: [
    { statement: 'Each documented route responds with its defined schema', kind: 'api', observable: 'a request to every route returns the declared status and shape' },
    { statement: 'Invalid input is rejected before it reaches storage', kind: 'api', observable: 'a malformed request returns 4xx and persists nothing' },
    { statement: 'Errors are structured rather than raw stack traces', kind: 'api', observable: 'an error response carries a machine-readable code' },
  ],
  worker: [
    { statement: 'Work is processed and acknowledged exactly once', kind: 'integration', observable: 'a queued item is handled and not reprocessed after acknowledgement' },
    { statement: 'A failing item does not stall the queue', kind: 'integration', observable: 'a failure is retried or dead-lettered and later items still process' },
  ],
  scheduled_job: [
    { statement: 'The job is idempotent across repeated runs', kind: 'integration', observable: 'running twice over the same input leaves the same end state' },
  ],
  library: [
    { statement: 'The public API is importable by a consumer', kind: 'integration', observable: 'a separate module imports the entrypoint and calls it' },
    { statement: 'Package artefacts are produced', kind: 'package', observable: 'the artefact exists at the path the adapter declares' },
  ],
  package: [
    { statement: 'Package artefacts are produced', kind: 'package', observable: 'the artefact exists at the path the adapter declares' },
  ],
  web_frontend: [
    { statement: 'The production build compiles', kind: 'build', observable: 'the build command exits 0 and emits its output directory' },
    { statement: 'The primary user journey completes', kind: 'browser', observable: 'a browser test walks the journey end to end' },
  ],
  browser_extension: [
    { statement: 'The manifest is valid and declares only the permissions used', kind: 'unit', observable: 'the manifest parses and every declared permission is exercised by the code' },
    { statement: 'The extension package can be assembled', kind: 'package', observable: 'a loadable archive is produced' },
  ],
  mobile_app: [
    { statement: 'The application compiles for its target platform', kind: 'build', observable: 'the platform build command exits 0' },
    { statement: 'Store distribution is completed', kind: 'manual', observable: 'a store listing exists', required: false },
  ],
  smart_contract: [
    { statement: 'Contract tests pass, including the failure paths', kind: 'contract', observable: 'the contract test suite exits 0 with assertions on reverts' },
    { statement: 'Mainnet deployment is authorised and performed', kind: 'manual', observable: 'a transaction hash on the target network', required: false },
  ],
  infrastructure_module: [
    { statement: 'The configuration is syntactically valid and produces a plan', kind: 'build', observable: 'the plan command exits 0 without applying anything' },
  ],
  data_pipeline: [
    { statement: 'A known input produces the expected output', kind: 'integration', observable: 'a fixture dataset is transformed to a recorded expectation' },
  ],
  etl: [
    { statement: 'A known input produces the expected output', kind: 'integration', observable: 'a fixture dataset is transformed to a recorded expectation' },
  ],
};

/** Criteria implied by requirements rather than by any surface. */
const BY_REQUIREMENT: ReadonlyArray<{ when: RegExp; template: Template }> = [
  { when: /\b(auth|login|sign[- ]?in|permission|role)\b/i, template: { statement: 'Unauthorised access is refused', kind: 'permission', observable: 'a request without valid credentials is rejected before any data is returned' } },
  { when: /\b(multi[- ]?tenant|organisation|organization|workspace)\b/i, template: { statement: 'One tenant cannot read another tenant\'s data', kind: 'permission', observable: 'a request scoped to tenant A returns nothing belonging to tenant B' } },
  { when: /\bdocker(?:file|ised|ized)?\b/i, template: { statement: 'The container image builds and the process starts', kind: 'build', observable: 'the image builds and the entrypoint reaches a ready state' } },
  { when: /\b(upload|file|image|attachment)\b/i, template: { statement: 'Uploaded files are validated before being stored', kind: 'api', observable: 'a file of an unexpected type or size is rejected' } },
];

function storageCriteria(spec: UniversalProductSpec): readonly Template[] {
  if (!spec.storageRequirements.length) return [];
  return [
    { statement: 'Written records survive a restart', kind: 'database', observable: 'a record written in one process is readable in another' },
    { statement: 'The schema is created by a migration rather than by hand', kind: 'database', observable: 'a migration file exists and applies to an empty database' },
  ];
}

/**
 * Compiles acceptance criteria for a spec and its plan.
 *
 * Surfaces with no template still produce a criterion — a generic one naming the surface
 * and its stated reason. That matters for §58 N: an unfamiliar product must yield
 * something checkable rather than an empty list that later reads as "nothing to verify".
 */
export function compileAcceptanceCriteria(input: {
  spec: UniversalProductSpec;
  plan?: ArchitecturePlan;
}): readonly AcceptanceCriterion[] {
  const { spec } = input;
  const criteria: AcceptanceCriterion[] = [];
  const seen = new Set<string>();

  const add = (template: Template, surface: ProductSurface | null, index: number) => {
    const id = `acceptance:${String(surface ?? 'general')}:${index}`;
    if (seen.has(template.statement)) return;
    seen.add(template.statement);
    criteria.push({
      id,
      statement: template.statement,
      surface,
      kind: template.kind,
      observable: template.observable,
      required: template.required ?? true,
      ...(template.kind === 'manual'
        ? { manualReason: 'requires an external account, credential or human review that no automated run can supply' }
        : {}),
    });
  };

  for (const declaration of spec.surfaces) {
    const templates = BY_SURFACE[declaration.surface as string];
    if (templates) {
      templates.forEach((template, index) => add(template, declaration.surface, index));
      continue;
    }
    // The open case. A surface with no template is not a gap to skip — it is a product
    // whose behaviour was stated, and the criterion says so in the terms the spec used.
    add(
      {
        statement: `The ${String(declaration.surface)} behaviour described in the request is demonstrated: ${declaration.reason}`,
        kind: 'integration',
        observable: 'a test exercises the described behaviour and asserts on its result',
      },
      declaration.surface,
      0,
    );
  }

  storageCriteria(spec).forEach((template, index) => add(template, null, index));

  for (const { when, template } of BY_REQUIREMENT) {
    if (when.test(spec.sourcePrompt)) add(template, null, criteria.length);
  }

  return criteria;
}

/**
 * Rejects criteria that cannot fail.
 *
 * A guard on this module's own output, kept because the failure it catches is one a
 * template makes easy: a statement that reads well and asserts nothing. If any of these
 * patterns ever match, a criterion has drifted back toward "App works."
 */
export function unfalsifiableCriteria(
  criteria: readonly AcceptanceCriterion[],
): readonly AcceptanceCriterion[] {
  const vague = [
    /^(the )?(app|application|product|site|system) works\b/i,
    /^it works\b/i,
    /\b(works correctly|functions properly|is production[- ]ready|looks good)\b/i,
  ];
  return criteria.filter(
    (criterion) =>
      vague.some((pattern) => pattern.test(criterion.statement)) || !criterion.observable.trim(),
  );
}

/** Criteria a run can settle by itself, which is what a completeness claim may count. */
export function automatedCriteria(
  criteria: readonly AcceptanceCriterion[],
): readonly AcceptanceCriterion[] {
  return criteria.filter((criterion) => criterion.kind !== 'manual');
}
