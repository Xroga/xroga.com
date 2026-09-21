import type {
  XrogaSoftwareAgentBindingImplementations,
} from './createXrogaSoftwareAgentBindings.js';

import type {
  SoftwareCheckResult,
  SoftwareExecutionContract,
  SoftwarePreviewEvidence,
} from './contracts.js';

import type {
  CommandExecutionResult,
  ReviewBranchResult,
} from './toolHost.js';

import type {
  ProjectFile,
} from '../../services/integrations/githubDeploy.js';

import {
  executeSandboxed,
} from '../../sandbox/sandboxRuntime.js';

import {
  buildSandboxEnvironment,
} from '../../sandbox/sandboxEnvironment.js';

import {
  browserVerificationAdapter,
} from '../../synthesis/browserVerificationAdapter.js';

import {
  sandboxValidationRunner,
} from '../../synthesis/productionAdapters.js';

import {
  mayClaimVerified,
  planUniversalRun,
  runValidationPlan,
} from '../../synthesis/universalFlow.js';

import {
  detectComposition,
  sandboxImageFor,
} from '../../synthesis/runtime/registry.js';

import {
  redactSecrets,
} from '../../lib/truthfulExecution.js';

import {
  persistSoftwareReviewBranch,
} from './softwareAgentGitHubPersistence.js';

export interface ExistingXrogaSoftwareInfrastructure {
  /**
   * Must execute ONLY inside Xroga's existing isolated sandbox.
   *
   * Never use child_process directly on the API host.
   */
  runSandboxCommand(input: {
    userId: string;
    contract: SoftwareExecutionContract;
    files: ProjectFile[];
    command: string;
  }): Promise<CommandExecutionResult>;

  /**
   * Must use Xroga's existing universal validation path.
   */
  runProjectChecks(input: {
    userId: string;
    contract: SoftwareExecutionContract;
    files: ProjectFile[];
  }): Promise<SoftwareCheckResult[]>;

  /**
   * Must use Xroga's existing one-shot browser-verification path.
   *
   * The implementation receives the current workspace snapshot
   * plus deterministic check evidence. It must not create a new
   * preview server or persistent preview-id subsystem.
   */
  verifyProjectPreview(input: {
    userId: string;
    contract: SoftwareExecutionContract;
    files: ProjectFile[];
    checks: SoftwareCheckResult[];
  }): Promise<SoftwarePreviewEvidence>;

  /**
   * Persist only verified work through Xroga's existing atomic
   * GitHub review-branch infrastructure.
   */
  createReviewBranch(input: {
    userId: string;
    contract: SoftwareExecutionContract;
    files: ProjectFile[];
    changedPaths: string[];
    deletedPaths: string[];
  }): Promise<ReviewBranchResult>;
}

const AD_HOC_COMMAND_TIMEOUT_MS =
  180_000;

const MAX_CHECK_SUMMARY_CHARS =
  1_600;

function safeCheckSummary(
  value: string,
): string | undefined {
  const clean =
    redactSecrets(
      value,
    )
      .replace(
        /\u0000/g,
        '',
      )
      .replace(
        /\r\n/g,
        '\n',
      )
      .trim();

  if (!clean) {
    return undefined;
  }

  if (
    clean.length <=
    MAX_CHECK_SUMMARY_CHARS
  ) {
    return clean;
  }

  return (
    '…' +
    clean.slice(
      -MAX_CHECK_SUMMARY_CHARS,
    )
  );
}

function displayCommand(
  command: {
    command: string;
    args: readonly string[];
  },
): string {
  return [
    command.command,
    ...command.args,
  ]
    .join(
      ' ',
    )
    .trim();
}

function normalizedExitCode(
  input: {
    exitCode: number | null;
    timedOut: boolean;
    killedForLimit: boolean;
  },
): number {
  if (
    typeof input.exitCode ===
    'number'
  ) {
    return input.exitCode;
  }

  if (
    input.timedOut
  ) {
    return 124;
  }

  if (
    input.killedForLimit
  ) {
    return 137;
  }

  return 1;
}

/**
 * Ad-hoc agent commands are exploratory.
 *
 * They run with outbound network denied and never inherit API-host
 * environment variables. Deterministic installs/builds/tests are owned
 * by the universal validation registry instead.
 */
function imageForAdHocCommand(
  files: readonly ProjectFile[],
): string | undefined {
  const composition =
    detectComposition(
      files,
    );

  if (
    composition.components.length ===
    0
  ) {
    return undefined;
  }

  const images =
    new Set(
      composition.components.map(
        (component) =>
          sandboxImageFor(
            component,
          ) ??
          '__xroga_default__',
      ),
    );

  /*
   * A single-toolchain repository can safely use that adapter's
   * image. A polyglot repository may need multiple incompatible
   * images, so an arbitrary shell command falls back to Xroga's
   * default sandbox instead of guessing which component the model
   * meant. run_checks remains the authoritative polyglot path.
   */
  if (
    images.size !==
    1
  ) {
    return undefined;
  }

  const [
    selected,
  ] =
    images;

  return selected ===
    '__xroga_default__'
    ? undefined
    : selected;
}

function validationCheckId(
  input: {
    index: number;
    phase: string;
    adapterId: string;
    componentRoot: string;
  },
): string {
  const root =
    input.componentRoot ||
    'root';

  return [
    'validation',
    String(
      input.index,
    ),
    input.phase,
    input.adapterId,
    root,
  ].join(
    ':',
  );
}

function checkOutput(
  stdout: string,
  stderr: string,
): string | undefined {
  const combined =
    [
      stderr,
      stdout,
    ]
      .filter(
        Boolean,
      )
      .join(
        '\n',
      );

  return safeCheckSummary(
    combined,
  );
}

function checkPhase(
  id: string,
  phase: string,
): boolean {
  return id.includes(
    `:${phase}:`,
  );
}

function deterministicBuildPassed(
  checks: readonly SoftwareCheckResult[],
): boolean {
  const buildBlockingPhases =
    [
      'install',
      'lint',
      'typecheck',
      'build',
      'package',
    ];

  return !checks.some(
    (check) =>
      check.status ===
        'failed' &&
      buildBlockingPhases.some(
        (phase) =>
          checkPhase(
            check.id,
            phase,
          ),
      ),
  );
}

function deterministicTestsPassed(
  checks: readonly SoftwareCheckResult[],
): boolean | null {
  const tests =
    checks.filter(
      (check) =>
        checkPhase(
          check.id,
          'test',
        ),
    );

  if (
    tests.length ===
    0
  ) {
    return null;
  }

  return tests.every(
    (check) =>
      check.status ===
      'passed',
  );
}

function previewEvidenceFromGate(
  result: Awaited<
    ReturnType<
      ReturnType<
        typeof browserVerificationAdapter
      >
    >
  >,
): SoftwarePreviewEvidence {
  return {
    status:
      result.status,

    attempted:
      result.attempted,

    url:
      result.url,

    notCheckedReason:
      result.notCheckedReason,

    blocker:
      result.blocker,

    evidenceForRepair:
      result.evidenceForRepair,

    criteriaNotChecked:
      [
        ...result.criteriaNotChecked,
      ],

    screenshots:
      [
        ...result.screenshots,
      ],

    rungReached:
      result.verdict
        ?.rungReached,
  };
}

/**
 * Concrete bridge from Agent V2 to infrastructure Xroga already owns.
 *
 * This function creates no new sandbox, validator, browser runtime,
 * repository writer, deployment mechanism or credential path.
 */
export function createDefaultSoftwareAgentProductionInfrastructure():
  ExistingXrogaSoftwareInfrastructure {
  return {
    async runSandboxCommand(
      input,
    ): Promise<CommandExecutionResult> {
      void input.userId;

      const command =
        input.command.trim();

      if (
        !command
      ) {
        throw new Error(
          'Sandbox command is required.',
        );
      }

      const startedAt =
        Date.now();

      const image =
        imageForAdHocCommand(
          input.files,
        );

      const result =
        await executeSandboxed({
          files:
            [
              ...input.files,
            ],

          /*
           * run_command is intentionally a shell-oriented agent tool.
           * The command remains one argv value; it is never interpolated
           * into an API-host shell.
           */
          command:
            '/bin/sh',

          args: [
            '-lc',
            command,
          ],

          timeoutMs:
            AD_HOC_COMMAND_TIMEOUT_MS,

          /*
           * Arbitrary model-authored shell commands do not receive
           * outbound network access. Dependency resolution belongs to
           * the deterministic validation registry, which scopes registry
           * access to setup commands only.
           */
          networkPolicy:
            'none',

          environment:
            buildSandboxEnvironment({
              CI:
                '1',
            }),

          ...(image
            ? {
                image,
              }
            : {}),
        });

      const exitCode =
        normalizedExitCode(
          result,
        );

      const infrastructureNote =
        result.timedOut
          ? 'Xroga stopped the command because it exceeded the execution deadline.'
          : result.killedForLimit
            ? 'Xroga stopped the command because it exceeded an isolation limit.'
            : '';

      return {
        commandId:
          crypto.randomUUID(),

        command,

        exitCode,

        stdout:
          result.stdout,

        stderr:
          [
            result.stderr,
            infrastructureNote,
          ]
            .filter(
              Boolean,
            )
            .join(
              '\n',
            ),

        durationMs:
          result.durationMs ||
          (
            Date.now() -
            startedAt
          ),
      };
    },

    async runProjectChecks(
      input,
    ): Promise<SoftwareCheckResult[]> {
      void input.userId;

      const plan =
        planUniversalRun({
          prompt:
            input.contract.goal,

          files:
            input.files,

          projectId:
            input.contract.projectId ??
            null,

          runId:
            input.contract.runId,
        });

      try {
        const report =
          await runValidationPlan(
            plan,

            sandboxValidationRunner(),

            input.files,
          );

        const checks:
          SoftwareCheckResult[] =
          [];

        for (
          let index = 0;
          index <
          report.executed.length;
          index += 1
        ) {
          const entry =
            report.executed[
              index
            ]!;

          /*
           * Optional validation failures are diagnostic only in the
           * universal engine. Do not turn them into required Agent V2
           * failures here.
           */
          if (
            entry.validation
              .command
              .optional ===
              true &&
            entry.exitCode !==
              0
          ) {
            continue;
          }

          const command =
            displayCommand(
              entry.validation
                .command,
            );

          checks.push({
            id:
              validationCheckId({
                index,

                phase:
                  entry.validation
                    .phase,

                adapterId:
                  entry.validation
                    .adapterId,

                componentRoot:
                  entry.validation
                    .componentRoot,
              }),

            name:
              `${
                entry.validation
                  .phase
              } · ${
                entry.validation
                  .adapterId
              }${
                entry.validation
                  .componentRoot
                  ? ` (${entry.validation.componentRoot})`
                  : ''
              }`,

            status:
              entry.exitCode ===
              0
                ? 'passed'
                : 'failed',

            command,

            exitCode:
              entry.exitCode ??
              undefined,

            summary:
              checkOutput(
                entry.stdout,
                entry.stderr,
              ),
          });
        }

        /*
         * The universal verifier owns the final truth about whether
         * the planned deterministic checks are enough to support a
         * completion claim. In particular, a green run over zero tests
         * remains unverified.
         */
        const claim =
          mayClaimVerified(
            plan,
            report,
          );

        checks.push({
          id:
            'xroga:verification-gate',

          name:
            'Xroga deterministic verification gate',

          status:
            claim.verified
              ? 'passed'
              : 'failed',

          summary:
            claim.reason,
        });

        return checks;
      } catch (
        error
      ) {
        /*
         * Infrastructure refusal is missing verification evidence,
         * not permission for the model to claim success.
         */
        return [
          {
            id:
              'xroga:verification-infrastructure',

            name:
              'Xroga deterministic verification infrastructure',

            status:
              'failed',

            summary:
              redactSecrets(
                error instanceof
                  Error
                  ? error.message
                  : String(
                      error,
                    ),
              ),
          },
        ];
      }
    },

    async verifyProjectPreview(
      input,
    ): Promise<SoftwarePreviewEvidence> {
      void input.userId;

      const acceptanceCriteria =
        input.contract
          .acceptanceCriteria
          .filter(
            (criterion) =>
              criterion.required,
          )
          .map(
            (criterion) =>
              criterion.description,
          );

      const verify =
        browserVerificationAdapter({
          acceptanceCriteria,
        });

      const result =
        await verify({
          files:
            input.files,

          buildPassed:
            deterministicBuildPassed(
              input.checks,
            ),

          testsPassed:
            deterministicTestsPassed(
              input.checks,
            ),
        });

      return previewEvidenceFromGate(
        result,
      );
    },

    async createReviewBranch(
      input,
    ): Promise<ReviewBranchResult> {
      return persistSoftwareReviewBranch(
        {
          userId:
            input.userId,

          contract:
            input.contract,

          files:
            input.files,

          changedPaths:
            input.changedPaths,

          deletedPaths:
            input.deletedPaths,
        },
      );
    },
  };
}

/**
 * Converts an infrastructure implementation into the guarded
 * binding surface consumed by createXrogaSoftwareAgentBindings().
 *
 * Tests can inject a fake infrastructure. Production can omit the
 * argument and receive the real Xroga bridge above.
 */
export function createSoftwareAgentProductionImplementations(
  infrastructure:
    ExistingXrogaSoftwareInfrastructure =
      createDefaultSoftwareAgentProductionInfrastructure(),
): XrogaSoftwareAgentBindingImplementations {
  return {
    async runSandboxCommand(
      input,
    ) {
      return infrastructure
        .runSandboxCommand(
          input,
        );
    },

    async runProjectChecks(
      input,
    ) {
      return infrastructure
        .runProjectChecks(
          input,
        );
    },

    async verifyProjectPreview(
      input,
    ) {
      return infrastructure
        .verifyProjectPreview(
          input,
        );
    },

    async createReviewBranch(
      input,
    ) {
      return infrastructure
        .createReviewBranch(
          input,
        );
    },
  };
}
