/**
 * The real adapters behind the enabled universal path.
 *
 * `executeUniversalRun` takes its side effects as parameters so it can be tested without a
 * model, a sandbox or a repository. That is the right shape, and it leaves exactly one
 * thing undone: something has to supply the real ones. Without this file the enabled path
 * is a function nobody calls with anything that does work — which is the difference between
 * a rollout and a flag.
 *
 * Everything here delegates to systems that already exist and are already hardened:
 * `executeSandboxed` for isolation, `reviewBuildOutput` for the full-diff review, and
 * `writeAtomically` for the commit. Nothing reimplements them, because a second
 * implementation of an atomic write is a second place for stale-head protection to be
 * subtly wrong.
 *
 * The review adapter is the one worth reading closely. It fails closed: any error, any
 * missing result, any unparsable reply becomes `approved: false`. A reviewer that throws
 * must not be interpreted as a reviewer that approved.
 */

import type { ProjectFile } from '../ai/patches.js';
import { executeSandboxed } from '../sandbox/sandboxRuntime.js';
import { reviewBuildOutput } from '../ai/qa.js';
import { buildSandboxEnvironment } from '../sandbox/sandboxEnvironment.js';
import type { ExecutionAdapters } from './universalExecution.js';
import type { UniversalRunPlan } from './universalFlow.js';
import type { SecurityControl } from './securityControls.js';
import { compileSecurityTests } from './securityControls.js';

/** Produces the file set for a plan. Supplied by the caller that owns model access. */
export type ImplementFn = (input: {
  brief: string;
  plan: UniversalRunPlan;
  existingFiles: readonly ProjectFile[];
}) => Promise<readonly ProjectFile[]>;

/** Commits a file set. Supplied by the caller that owns the repository connection. */
export type CommitFn = (input: {
  files: readonly ProjectFile[];
  message: string;
}) => Promise<{ commitSha: string }>;

/**
 * The brief handed to the implementation model.
 *
 * Assembled from the plan rather than from the raw prompt, because the plan is where the
 * decisions live. A brief built from the prompt alone would let the model re-choose a
 * language that the planner already settled against repository evidence — which is exactly
 * the failure the planner exists to prevent, reintroduced one layer down.
 *
 * Security controls are included as requirements rather than suggestions, and their
 * negative tests are named explicitly: "reject a request for another user's resource" is
 * actionable in a way that "implement authorization" is not.
 */
export function buildImplementationBrief(input: {
  plan: UniversalRunPlan;
  securityControls: readonly SecurityControl[];
}): string {
  const { plan } = input;
  const lines: string[] = [
    `Objective: ${plan.spec.requestedOutcome}`,
    '',
    `Surfaces: ${plan.spec.surfaces.map((declaration) => String(declaration.surface)).join(', ')}`,
  ];

  lines.push('', 'Components — implement each at its stated root:');
  for (const component of plan.architecture.components) {
    lines.push(
      `  - ${component.root || '(repository root)'}: ${component.language ?? 'unknown'}` +
        (component.framework ? ` with ${component.framework}` : '') +
        (component.packageManager ? `, managed by ${component.packageManager}` : ''),
    );
  }

  // Decisions travel with their reasons so the model extends them rather than relitigating.
  lines.push('', 'Architecture decisions already made (do not change these):');
  for (const decision of plan.architecture.decisions) {
    lines.push(`  - ${decision.category}: ${decision.selection} — ${decision.reason}`);
  }

  if (plan.acceptance.length) {
    lines.push('', 'Acceptance criteria — the build is judged against these:');
    for (const criterion of plan.acceptance) {
      lines.push(`  - ${criterion.statement} (observed by: ${criterion.observable})`);
    }
  }

  if (input.securityControls.length) {
    lines.push('', 'Security requirements — each must hold, and each names what must be refused:');
    for (const control of input.securityControls) {
      lines.push(`  - [${control.severity}] ${control.requirement}`);
      if (control.negativeTest) lines.push(`      must refuse: ${control.negativeTest}`);
    }
    const negatives = compileSecurityTests(input.securityControls).filter((test) => test.kind === 'negative');
    if (negatives.length) {
      lines.push('', `Write ${negatives.length} negative test(s) proving those refusals actually happen.`);
    }
  }

  if (plan.architecture.inheritedFromRepository) {
    lines.push(
      '',
      'This repository already exists. Extend its conventions and keep its stack; change the',
      'minimum coherent set of files and do not restructure code unrelated to the request.',
    );
  }

  return lines.join('\n');
}

/**
 * Builds the adapter set the enabled path runs on.
 *
 * `implement` and `commit` are injected because they need credentials and a repository
 * identity this module has no business owning. Validation and review are constructed here,
 * since both are pure functions of the files plus systems that already exist.
 */
export function productionAdapters(input: {
  implement: ImplementFn;
  commit: CommitFn;
  reviewerModel?: string;
  acceptanceCriteria?: readonly string[];
  sourceCommitSha?: string;
}): ExecutionAdapters {
  return {
    implement: async ({ plan, securityControls, existingFiles }) =>
      input.implement({
        brief: buildImplementationBrief({ plan, securityControls }),
        plan,
        existingFiles,
      }),

    runValidation: async (command) => {
      // Straight through the Command 1 boundary. The adapter already decided the network
      // policy per command, so nothing here widens it.
      const result = await executeSandboxed({
        files: [],
        command: command.command,
        args: [...command.args],
        timeoutMs: 600_000,
        networkPolicy: command.networkPolicy,
        environment: buildSandboxEnvironment(
          command.cwd ? { XROGA_SANDBOX_WORKDIR: command.cwd } : undefined,
        ),
      });
      return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
    },

    review: async (files) => {
      try {
        const result = await reviewBuildOutput({
          prompt: 'Universal engineering run — review the complete generated change.',
          html: '', css: '', js: '',
          files: [...files],
          acceptanceCriteria: input.acceptanceCriteria ? [...input.acceptanceCriteria] : undefined,
          changedFiles: files.map((file) => file.path),
          commitSha: input.sourceCommitSha,
        } as Parameters<typeof reviewBuildOutput>[0]);

        return { approved: Boolean(result?.ok), findings: result?.issues ?? [] };
      } catch (error) {
        // A reviewer that throws is not a reviewer that approved. §46 requires the review
        // to fail closed, and this is the only place that could quietly invert it.
        return {
          approved: false,
          findings: [
            `the reviewer did not complete: ${error instanceof Error ? error.message : String(error)}. ` +
              'Treating an incomplete review as a rejection.',
          ],
        };
      }
    },

    commit: async (files, message) => input.commit({ files, message }),
  };
}
