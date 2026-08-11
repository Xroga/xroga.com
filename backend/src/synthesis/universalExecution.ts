/**
 * The enabled universal path — the one that actually writes files.
 *
 * Everything before this was inert. The planner could describe a build and the shadow
 * observer could compare decisions, but no request ever reached generation through it.
 * §M17 calls this critical for a reason: a routing boolean that changes nothing is not a
 * rollout, it is a flag.
 *
 * The rule that shapes the whole module is about *when falling back is allowed*.
 *
 * Before anything is written, falling back to the legacy pipeline is safe — nothing has
 * happened, and the legacy path is the one serving production. But it is only safe when
 * legacy would build the *same kind of product*. A Rust CLI that fails during universal
 * planning must not fall back to a pipeline whose vocabulary tops out at four web
 * scaffolds, because the fallback would succeed and produce a website. Silent success with
 * the wrong artefact is the exact failure this whole command exists to remove, and a
 * fallback is the easiest place to reintroduce it.
 *
 * After the first mutation, fallback is forbidden outright. Half a Rust crate plus a
 * legacy static site is not a product, and a run that switched paths mid-write leaves a
 * repository nobody can reason about.
 *
 * So `canFallBack` is a function with a reason, not a boolean, and the reason is recorded.
 */

import type { ProjectFile } from '../ai/patches.js';
import { planUniversalRun, runValidationPlan, mayClaimVerified, type UniversalRunPlan, type ValidationRunner } from './universalFlow.js';
import { deriveSecurityControls, securityRoutingRequirement, type SecurityControl } from './securityControls.js';
import { compileAcceptanceCriteria } from './acceptanceCompiler.js';
import { mayWrite, routeProject, type UniversalAgentFlags } from '../config/universalAgentFlags.js';
import { detectComposition } from './runtime/registry.js';
import type { Owner, UniversalStore } from './universalPersistence.js';
import { runImplementationAsCanonicalTask, runValidationAsCanonicalTask } from './universalCanonicalTasks.js';
import type { CanonicalExecutionState, ExecutableTaskNode, ExecutionStateStore } from '../ai/executionRuntime.js';
import type { ModelId } from '../ai/models.js';

export const UNIVERSAL_EXECUTION_SCHEMA_VERSION = '1.0.0' as const;

export type ExecutionPhase =
  | 'routing' | 'spec' | 'architecture' | 'security' | 'planning'
  | 'implementation' | 'validation' | 'repair' | 'review' | 'commit' | 'complete';

export type ExecutionOutcome =
  | 'completed'
  | 'refused'
  | 'blocked'
  | 'failed'
  | 'fell_back_to_legacy'
  | 'not_selected';

export interface ExecutionEvidenceRecord {
  readonly phase: ExecutionPhase;
  readonly statement: string;
  readonly detail: string;
}

export interface UniversalExecutionResult {
  readonly outcome: ExecutionOutcome;
  readonly phaseReached: ExecutionPhase;
  readonly plan: UniversalRunPlan | null;
  readonly securityControls: readonly SecurityControl[];
  readonly files: readonly ProjectFile[];
  readonly commitSha: string | null;
  readonly evidence: readonly ExecutionEvidenceRecord[];
  readonly blockers: readonly string[];
  /** True once anything has been written. After this, no fallback is permitted. */
  readonly mutationBegan: boolean;
  readonly verified: boolean;
  readonly reason: string;
}

/** What the caller supplies to actually do the work. Keeps this module free of I/O. */
export interface ExecutionAdapters {
  /** Produces the file set for the plan. The model implementation step. */
  readonly implement: (input: {
    plan: UniversalRunPlan;
    securityControls: readonly SecurityControl[];
    existingFiles: readonly ProjectFile[];
  }) => Promise<readonly ProjectFile[]>;
  /** Runs one validation command under isolation. */
  readonly runValidation: ValidationRunner;
  /** Reviews the complete diff. Returns findings; a non-empty critical list blocks. */
  readonly review: (files: readonly ProjectFile[]) => Promise<{ approved: boolean; findings: readonly string[] }>;
  /** Writes through the transactional workspace and returns the exact commit. */
  readonly commit: (files: readonly ProjectFile[], message: string) => Promise<{ commitSha: string }>;
  /** Optional bounded repair between validation attempts. */
  readonly repair?: (input: { plan: UniversalRunPlan; failures: readonly string[]; files: readonly ProjectFile[] }) => Promise<readonly ProjectFile[] | null>;
}

/**
 * Whether a failed universal run may hand off to legacy.
 *
 * Two conditions, and the second is the one that is easy to miss. Nothing may have been
 * written — obviously. And legacy must be capable of the same product: its vocabulary is
 * `static`, `nextjs`, `expo`, `chrome` and `electron`, so it can only serve a request whose
 * surfaces are genuinely web or mobile. For anything else, falling back does not fail — it
 * succeeds at building the wrong thing, which is worse.
 */
export function canFallBack(input: {
  mutationBegan: boolean;
  surfaces: readonly string[];
}): { allowed: boolean; reason: string } {
  if (input.mutationBegan) {
    return {
      allowed: false,
      reason:
        'files have already been written by the universal path; switching to legacy now would leave a ' +
        'repository half-built by two different pipelines',
    };
  }
  if (!input.surfaces.length) {
    return {
      allowed: false,
      reason:
        'no surface was determined, so there is no way to tell whether legacy would build the same kind of ' +
        'product; falling back here is how an unfamiliar request becomes a website',
    };
  }

  // Everything the legacy scaffolds can actually produce.
  const legacyCapable = new Set(['web_frontend', 'documentation_site', 'browser_extension', 'mobile_app', 'desktop_app']);
  const unsupported = input.surfaces.filter((surface) => !legacyCapable.has(surface));
  if (unsupported.length) {
    return {
      allowed: false,
      reason:
        `the legacy pipeline cannot build ${unsupported.join(', ')} — its vocabulary is static, nextjs, expo, ` +
        'chrome and electron, so a fallback would succeed at building the wrong product rather than fail',
    };
  }
  return { allowed: true, reason: 'nothing has been written and legacy can build these surfaces' };
}

/**
 * Runs a request through the universal path.
 *
 * Phases are recorded as they complete, so a failure reports how far it got. That matters
 * more than it sounds: "failed" tells nobody whether a repository was touched, and
 * `phaseReached` plus `mutationBegan` together answer it exactly.
 */
export async function executeUniversalRun(input: {
  prompt: string;
  owner: Owner;
  runId: string;
  existingFiles?: readonly ProjectFile[];
  flags?: UniversalAgentFlags;
  adapters: ExecutionAdapters;
  store?: UniversalStore;
  commitMessage?: string;
  /**
   * Where the canonical task graph is persisted.
   *
   * Optional so existing callers and tests are unchanged; an in-memory store is used when
   * absent, which still enforces the scheduler's completion rule but does not survive the
   * process. Production passes the durable store.
   */
  executionStore?: ExecutionStateStore;
  /** Routing actually chosen for implementation, recorded on the canonical task. */
  implementationRouting?: {
    selectedModel: ModelId | null;
    provider: string | null;
    fallbackModels: readonly ModelId[];
  };
  signal?: AbortSignal;
}): Promise<UniversalExecutionResult> {
  const evidence: ExecutionEvidenceRecord[] = [];
  const existingFiles = input.existingFiles ?? [];
  let mutationBegan = false;

  const record = (phase: ExecutionPhase, statement: string, detail: string) =>
    evidence.push({ phase, statement, detail });

  const fail = (
    outcome: ExecutionOutcome,
    phase: ExecutionPhase,
    reason: string,
    plan: UniversalRunPlan | null,
    blockers: readonly string[] = [],
    files: readonly ProjectFile[] = [],
  ): UniversalExecutionResult => ({
    outcome, phaseReached: phase, plan, securityControls: [], files,
    commitSha: null, evidence, blockers, mutationBegan, verified: false, reason,
  });

  // ── Routing ────────────────────────────────────────────────────────────────
  const decision = routeProject(input.owner.projectId, input.flags);
  record('routing', 'routing decision', decision.reason);

  if (!mayWrite(decision)) {
    return {
      outcome: 'not_selected', phaseReached: 'routing', plan: null, securityControls: [],
      files: [], commitSha: null, evidence, blockers: [], mutationBegan: false, verified: false,
      reason: `the universal path may not write for this project: ${decision.reason}`,
    };
  }

  // ── Spec and architecture ──────────────────────────────────────────────────
  const plan = planUniversalRun({
    prompt: input.prompt, files: existingFiles,
    projectId: input.owner.projectId, runId: input.runId,
  });
  record('spec', 'product surfaces determined', plan.spec.surfaces.map((s) => String(s.surface)).join(', ') || 'none');
  record('architecture', 'architecture selected', plan.summary);

  await input.store?.saveSpec(input.owner, plan.spec, input.runId);
  await input.store?.savePlan(input.owner, plan.architecture, null, input.runId);

  if (plan.status === 'refused_no_surface') {
    // Refusing is a correct outcome, and the fallback check is what stops it becoming a
    // website by another route.
    const fallback = canFallBack({ mutationBegan, surfaces: [] });
    record('architecture', 'refused', fallback.reason);
    return fail('refused', 'architecture', plan.blockers[0] ?? 'no surface could be determined', plan, plan.blockers);
  }

  // ── Security ───────────────────────────────────────────────────────────────
  const securityControls = deriveSecurityControls({ spec: plan.spec, plan: plan.architecture });
  const securityRouting = securityRoutingRequirement(securityControls);
  record('security', `${securityControls.length} control(s) derived`, securityRouting.reason);

  const acceptance = compileAcceptanceCriteria({ spec: plan.spec, plan: plan.architecture });
  record('planning', `${acceptance.length} acceptance criteria compiled`, acceptance.map((c) => c.id).join(', '));

  if (plan.status === 'blocked_no_adapter') {
    return fail('blocked', 'planning', plan.blockers[0] ?? 'no adapter can build this', plan, plan.blockers);
  }

  // ── Implementation ─────────────────────────────────────────────────────────
  // Executed as a canonical persisted task rather than as a direct adapter call. The
  // adapter still does the work — this is a migration of *where* it runs, not of what it
  // does — but the scheduler now owns the completion decision, so implementation cannot be
  // recorded as done unless it produced a usable file set and evidence bound to it.
  //
  // The throw is preserved deliberately. The catch below already decides between a legacy
  // fallback and outright failure, and changing that here would turn a runtime migration
  // into a behaviour change.
  let files: readonly ProjectFile[];
  let implementationTask: ExecutableTaskNode | null = null;
  // The canonical state the implementation task ran in. Validation appends to it so the
  // run has one task graph; two states would make the record claim two runs happened.
  let implementationState: CanonicalExecutionState | null = null;
  try {
    const canonical = await runImplementationAsCanonicalTask({
      projectId: input.owner.projectId,
      runId: input.runId,
      existingFiles,
      task: {
        objective: `Implement ${plan.spec.title}`,
        selectedModel: input.implementationRouting?.selectedModel ?? null,
        provider: input.implementationRouting?.provider ?? null,
        fallbackModels: input.implementationRouting?.fallbackModels ?? [],
        contextReferences: [
          'product specification',
          'architecture plan',
          `${securityControls.length} security control(s)`,
          `${existingFiles.length} existing file(s)`,
        ],
        allowedFiles: existingFiles.map((file) => file.path),
      },
      implement: () => input.adapters.implement({ plan, securityControls, existingFiles }),
      store: input.executionStore,
      signal: input.signal,
    });
    files = canonical.files;
    implementationTask = canonical.task;
    implementationState = canonical.state;
  } catch (error) {
    // Still before any write, so a fallback is at least conceivable — but only if legacy
    // could build the same product.
    const surfaces = plan.spec.surfaces.map((declaration) => String(declaration.surface));
    const fallback = canFallBack({ mutationBegan, surfaces });
    record('implementation', 'implementation failed', fallback.reason);
    return fail(
      fallback.allowed ? 'fell_back_to_legacy' : 'failed',
      'implementation',
      `implementation failed: ${error instanceof Error ? error.message : String(error)}. ${fallback.reason}`,
      plan,
    );
  }

  if (!files.length) {
    return fail('failed', 'implementation', 'the implementation step produced no files', plan);
  }
  record('implementation', `${files.length} file(s) generated`, files.map((file) => file.path).slice(0, 20).join(', '));
  // States plainly that implementation ran as a canonical task, and names the evidence the
  // scheduler required before it would complete. Without this the run's own evidence would
  // not distinguish a canonical execution from the direct adapter call it replaced.
  if (implementationTask) {
    record(
      'implementation',
      `canonical task ${implementationTask.id} completed`,
      `role=implementation model=${implementationTask.selectedModel ?? 'unrouted'} ` +
        `attempts=${implementationTask.attempts} ` +
        `evidence=${implementationTask.evidence.map((item) => item.identifier ?? item.kind).join(', ')}`,
    );
  }

  // From here the composition is derived from what was actually generated rather than from
  // the plan, because the plan is a prediction and the files are a fact.
  const composition = detectComposition(files);
  record('implementation', 'components detected in generated files',
    composition.components.map((component) => `${component.root || '.'}=${component.adapterId}`).join(', '));

  // ── Validation, with bounded repair ────────────────────────────────────────
  const validationPlan = planUniversalRun({
    prompt: input.prompt, files, projectId: input.owner.projectId, runId: input.runId,
  });
  // Validation runs as a canonical task on the same state the implementation task is
  // recorded in, so the run has one task graph rather than two. The sandbox's exit codes
  // remain the only verdict — §19 puts executable verification above model confidence, and
  // the validation task carries no model at all, which makes a model-driven pass
  // structurally unavailable rather than merely discouraged.
  const canonicalValidation = implementationState
    ? await runValidationAsCanonicalTask({
        state: implementationState,
        objective: `Validate ${plan.spec.title}`,
        validate: () => runValidationPlan(validationPlan, input.adapters.runValidation),
        store: input.executionStore,
        signal: input.signal,
      })
    : null;
  let report = canonicalValidation
    ? canonicalValidation.report
    : await runValidationPlan(validationPlan, input.adapters.runValidation);
  record('validation', `tier ${report.tierReached}`, report.blocker ?? `${report.executed.length} command(s) ran`);
  if (canonicalValidation) {
    record(
      'validation',
      `canonical task ${canonicalValidation.task.id} ${canonicalValidation.task.status}`,
      `${canonicalValidation.records.length} command record(s) persisted with exit codes`,
    );
  }

  if (!report.passed && input.adapters.repair) {
    const failures = report.failures.map((failure) => `${failure.validation.command.command}: ${failure.stderr.slice(0, 200)}`);
    const repaired = await input.adapters.repair({ plan: validationPlan, failures, files });
    if (repaired) {
      files = repaired;
      record('repair', 'bounded repair applied', `${failures.length} failure(s) addressed`);
      const rerunPlan = planUniversalRun({ prompt: input.prompt, files, projectId: input.owner.projectId, runId: input.runId });
      report = await runValidationPlan(rerunPlan, input.adapters.runValidation);
      record('validation', `revalidation tier ${report.tierReached}`, report.blocker ?? 'revalidated after repair');
    }
  }

  if (!report.passed) {
    return fail('failed', 'validation', report.blocker ?? 'validation failed', validationPlan,
      report.blocker ? [report.blocker] : [], files);
  }

  // ── Review over the complete diff ──────────────────────────────────────────
  const review = await input.adapters.review(files);
  record('review', review.approved ? 'review approved' : 'review found blocking issues',
    review.findings.join('; ') || 'no findings');

  if (!review.approved) {
    // Nothing has been committed, and this is not a fallback candidate: review failing
    // means the generated code has a problem, and legacy would not fix it.
    return fail('failed', 'review', `review blocked the change: ${review.findings.join('; ')}`, validationPlan, review.findings, files);
  }

  // ── Commit ─────────────────────────────────────────────────────────────────
  const claim = mayClaimVerified(validationPlan, report);
  mutationBegan = true;
  const { commitSha } = await input.adapters.commit(
    files,
    input.commitMessage ?? `feat: ${plan.spec.title}`,
  );
  record('commit', 'exact commit produced', commitSha);
  record('complete', 'verification claim', claim.reason);

  return {
    outcome: 'completed', phaseReached: 'complete', plan: validationPlan, securityControls,
    files, commitSha, evidence, blockers: [], mutationBegan: true,
    // The claim comes from the evidence, not from having reached the end of the function.
    verified: claim.verified,
    reason: claim.reason,
  };
}

/**
 * A resumed run's starting point.
 *
 * §M17 requires an interrupted universal run to resume universally rather than restarting
 * under legacy. Once a commit exists the run mutated the repository, and handing it to a
 * different pipeline would mean two engines editing one tree with different assumptions.
 */
export function resumePolicy(previous: {
  mutationBegan: boolean;
  commitSha: string | null;
  phaseReached: ExecutionPhase;
}): { resumeUniversally: boolean; reason: string } {
  if (previous.mutationBegan || previous.commitSha) {
    return {
      resumeUniversally: true,
      reason: 'the run already wrote to the repository; it must continue on the path that started it',
    };
  }
  if (previous.phaseReached === 'routing') {
    return { resumeUniversally: false, reason: 'the run never got past routing, so either path may take it' };
  }
  return {
    resumeUniversally: true,
    reason: `the run reached ${previous.phaseReached} with a universal spec and plan; resuming elsewhere would discard them`,
  };
}
