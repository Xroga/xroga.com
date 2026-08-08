/**
 * The universal path, end to end.
 *
 * Composes the pieces into the sequence §1 describes — request, spec, plan, adapters,
 * validation — and produces something executable rather than descriptive. §82 is blunt
 * about the failure mode: schema creation is not implementation, and hundreds of empty
 * interfaces are not a system. So this returns concrete commands bound to concrete
 * components, and a caller can run them.
 *
 * The property worth stating is what this module does *not* contain. There is no npm here,
 * no cargo, no pytest, and no branch on language anywhere. Every command comes from an
 * adapter keyed to a component. That is what makes adding Go a matter of registering an
 * adapter rather than editing the flow, and it is asserted by a test that reads this file's
 * own source.
 *
 * The other property is that refusal is a first-class outcome. `status` can be
 * `refused_no_surface` or `blocked_no_adapter`, and both are successful executions of this
 * function. The mechanism being replaced could not express either, so it produced a static
 * website instead — an artefact that builds, deploys, and is wrong.
 */

import type { ProjectFile } from '../ai/patches.js';
import {
  synthesizeUniversalProductSpec,
  type UniversalProductSpec,
} from './universalProductSpec.js';
import { planArchitecture, planIsRefusal, type ArchitecturePlan } from './architecturePlan.js';
import { compileAcceptanceCriteria, automatedCriteria, type AcceptanceCriterion } from './acceptanceCompiler.js';
import {
  commandsFor,
  detectComposition,
  sandboxImageFor,
  type DetectedComponent,
  type ValidationPhase,
} from './runtime/registry.js';
import { discoverRepository } from './runtime/repositoryDiscovery.js';
import { deriveRuntimeCapability, type RuntimeCapabilitySpec } from './runtime/runtimeDiscovery.js';
import type { ToolCommand } from './runtime/adapterContract.js';

export type UniversalRunStatus =
  | 'ready'
  | 'ready_with_blockers'
  | 'refused_no_surface'
  | 'blocked_no_adapter';

export interface PlannedValidation {
  readonly componentRoot: string;
  readonly adapterId: string;
  readonly phase: ValidationPhase;
  readonly command: ToolCommand;
  /**
   * The image this command needs, or null for the sandbox default.
   *
   * Carried per validation rather than per run because a polyglot repository needs a
   * different image per component: the Rust worker cannot run in the Python image and
   * neither can run in the Node one. A single run-wide image would make two of the three
   * components fail on a missing toolchain.
   */
  readonly sandboxImage: string | null;
}

export interface UniversalRunPlan {
  readonly spec: UniversalProductSpec;
  readonly architecture: ArchitecturePlan;
  readonly acceptance: readonly AcceptanceCriterion[];
  readonly validations: readonly PlannedValidation[];
  readonly status: UniversalRunStatus;
  readonly blockers: readonly string[];
  /** Set when an unrecognised toolchain needs §12 discovery before anything can run. */
  readonly discovery: RuntimeCapabilitySpec | null;
  readonly summary: string;
}

/**
 * Phases in the order they must run.
 *
 * Install first because everything else needs dependencies; typecheck before test because
 * a type error makes a test failure meaningless; build last because there is no point
 * building code that fails its own tests.
 */
const PHASES: readonly ValidationPhase[] = ['install', 'lint', 'typecheck', 'test', 'build', 'package'];

function validationsFor(components: readonly DetectedComponent[]): readonly PlannedValidation[] {
  const validations: PlannedValidation[] = [];
  for (const component of components) {
    const sandboxImage = sandboxImageFor(component);
    for (const phase of PHASES) {
      for (const command of commandsFor(component, phase)) {
        validations.push({
          componentRoot: component.root,
          adapterId: component.adapterId,
          phase,
          command,
          sandboxImage,
        });
      }
    }
  }
  return validations;
}

/**
 * Plans a run for a request and, when present, a repository.
 *
 * Existing repositories drive validation directly, because their components are facts.
 * Greenfield work cannot: there are no files yet, so the architecture names languages but
 * no adapter has anything to inspect. That distinction is deliberate rather than a gap —
 * emitting `cargo test` for a crate that does not exist would be a command guaranteed to
 * fail, and calling it a validation plan would be a lie about what has been checked.
 */
export function planUniversalRun(input: {
  prompt: string;
  files?: readonly ProjectFile[];
  projectId?: string | null;
  runId?: string | null;
}): UniversalRunPlan {
  const files = input.files ?? [];
  const spec = synthesizeUniversalProductSpec({
    prompt: input.prompt,
    files,
    projectId: input.projectId ?? null,
    runId: input.runId ?? null,
  });
  const architecture = planArchitecture({ spec, files });
  const acceptance = compileAcceptanceCriteria({ spec, plan: architecture });

  if (planIsRefusal(architecture)) {
    return {
      spec, architecture, acceptance: [], validations: [],
      status: 'refused_no_surface',
      blockers: architecture.blockers,
      discovery: null,
      summary:
        'No product surface could be determined from the request, so nothing was planned and nothing was generated. ' +
        'Refusing here is deliberate: the previous behaviour was to default to a static website, which produces an ' +
        'artefact that builds and deploys and is wrong.',
    };
  }

  const composition = files.length ? detectComposition(files) : { components: [], unclaimedRoots: [], polyglot: false };
  const validations = validationsFor(composition.components);

  // Discovery engages only when a repository holds something no adapter can build. A
  // greenfield request has nothing to discover.
  const repositoryDiscovery = files.length ? discoverRepository(files) : null;
  const discovery = repositoryDiscovery?.needsRuntimeDiscovery
    ? deriveRuntimeCapability(files, repositoryDiscovery)
    : null;

  const blockers = [...architecture.blockers];
  if (discovery && !discovery.candidates.length) {
    blockers.push(
      `${discovery.displayName}: no build or test command could be derived from CI configuration, ` +
        'container definitions, Makefiles or documentation, so this component cannot be validated.',
    );
  }

  const buildable = architecture.components.filter((component) => component.adapterId !== null);
  const status: UniversalRunStatus =
    buildable.length === 0 && architecture.components.length > 0
      ? 'blocked_no_adapter'
      : blockers.length
        ? 'ready_with_blockers'
        : 'ready';

  return {
    spec, architecture, acceptance, validations, status, blockers, discovery,
    summary: describeRun({ spec, architecture, acceptance, validations, status, blockers, discovery }),
  };
}

function describeRun(plan: Omit<UniversalRunPlan, 'summary'>): string {
  const surfaces = plan.spec.surfaces.map((declaration) => String(declaration.surface)).join(', ') || 'none determined';
  const languages = [...new Set(plan.architecture.components.map((component) => component.language).filter(Boolean))];
  const automated = automatedCriteria(plan.acceptance).length;
  const manual = plan.acceptance.length - automated;

  const lines = [
    `Surfaces: ${surfaces}`,
    `Languages: ${languages.join(', ') || 'none selected'}`,
    `Acceptance criteria: ${automated} automated` + (manual ? `, ${manual} needing a person` : ''),
    `Validation commands: ${plan.validations.length}`,
  ];

  if (plan.discovery) {
    lines.push(
      `Unrecognised toolchain: ${plan.discovery.displayName} — ` +
        `${plan.discovery.candidates.length} candidate command(s) derived, not yet executed`,
    );
  }
  for (const blocker of plan.blockers) lines.push(`Blocker: ${blocker}`);
  return lines.join('\n');
}

export interface ExecutedValidation {
  readonly validation: PlannedValidation;
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly skipped: boolean;
}

export type ValidationRunner = (command: ToolCommand) => Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
}>;

export interface ValidationReport {
  readonly executed: readonly ExecutedValidation[];
  readonly passed: boolean;
  readonly failures: readonly ExecutedValidation[];
  /** The tier actually reached, per §57. Never claims more than was run. */
  readonly tierReached: 'none' | 'static_only' | 'sandbox';
  readonly blocker: string | null;
}

/**
 * Runs a validation plan through the sandbox.
 *
 * Two rules matter here and both come from Command 1's experience.
 *
 * An optional command failing does not fail the run, but a missing toolchain still stops
 * it — a formatter that is not installed is noise, while a missing compiler means nothing
 * downstream was checked and reporting a pass would be false.
 *
 * And `tierReached` never overstates. If nothing executed it says `none`; §57 exists
 * because a status that quietly implies a higher tier than was reached is the most
 * expensive kind of wrong. The blocker text says "nothing was executed" in exactly the
 * words the sandbox uses, so the two records agree.
 */
export async function runValidationPlan(
  plan: UniversalRunPlan,
  run: ValidationRunner,
): Promise<ValidationReport> {
  if (!plan.validations.length) {
    return {
      executed: [], passed: false, failures: [], tierReached: 'none',
      blocker:
        plan.status === 'refused_no_surface'
          ? 'No architecture was selected, so nothing was executed.'
          : 'No validation commands were planned, so nothing was executed and no tier was reached.',
    };
  }

  const executed: ExecutedValidation[] = [];
  const failures: ExecutedValidation[] = [];

  for (const validation of plan.validations) {
    const result = await run(validation.command);
    const record: ExecutedValidation = { validation, ...result, skipped: false };
    executed.push(record);

    const combined = `${result.stdout}\n${result.stderr}`;
    if (/command not found|is not recognized as an internal/i.test(combined)) {
      return {
        executed, passed: false, failures: [...failures, record], tierReached: 'sandbox',
        blocker:
          `${validation.command.command} is not available in the sandbox image, so the ` +
          `${validation.phase} phase for ${validation.componentRoot || 'the repository root'} could not run. ` +
          'Nothing after this point was executed. No source change can fix this; the image needs the toolchain.',
      };
    }

    if (result.exitCode !== 0) {
      if (validation.command.optional) continue;
      failures.push(record);
      // Later phases assume earlier ones succeeded, so continuing past a real failure
      // produces cascading errors that hide the one that matters.
      break;
    }
  }

  return {
    executed,
    passed: failures.length === 0,
    failures,
    tierReached: 'sandbox',
    blocker: null,
  };
}

/**
 * Whether the run may claim the outcome was verified.
 *
 * Deliberately strict, and the strictness is §22 and §49 together: a model cannot mark its
 * own work verified, and a completion claim needs executable evidence. Every clause here
 * corresponds to a way a run could look finished without being it.
 */
export function mayClaimVerified(plan: UniversalRunPlan, report: ValidationReport): {
  verified: boolean;
  reason: string;
} {
  if (plan.status === 'refused_no_surface') {
    return { verified: false, reason: 'nothing was planned, so there is nothing to verify' };
  }
  if (plan.blockers.length) {
    return { verified: false, reason: `blockers remain: ${plan.blockers[0]}` };
  }
  if (report.tierReached !== 'sandbox') {
    return { verified: false, reason: 'no validation reached the sandbox tier' };
  }
  if (!report.passed) {
    return { verified: false, reason: `${report.failures.length} validation(s) failed` };
  }
  // A run with no test command has proven the code compiles and nothing more. §18 counts
  // a green run over zero tests as a failure, and this is where that is enforced.
  const ranTests = report.executed.some(
    (entry) => entry.validation.phase === 'test' && entry.exitCode === 0,
  );
  if (!ranTests) {
    return { verified: false, reason: 'no test command ran, so passing proves only that the toolchain executed' };
  }
  return { verified: true, reason: 'every planned validation ran in the sandbox and passed, including tests' };
}
