import type {
  SoftwareExecutionContract,
  SoftwareRunEvidence,
} from './contracts.js';

import type {
  SoftwareRunEventSink,
} from './runEvents.js';

import type {
  SoftwareAgentModelRoute,
} from './agentModelRoute.js';

import type {
  XrogaSoftwareAgentBindings,
} from './xrogaProductionAdapters.js';

import {
  createXrogaProductionDependencies,
} from './xrogaProductionAdapters.js';

import {
  createProductionSoftwareAgentOperations,
} from './productionOperations.js';

import {
  createProductionSoftwareAgentToolHost,
} from './ProductionSoftwareAgentToolHost.js';

import {
  AgentSoftwareExecutor,
  type AgentSoftwareExecutorResult,
} from './AgentSoftwareExecutor.js';

import {
  createAgentEvidence,
} from './createAgentEvidence.js';

import type {
  SoftwareAgentWorkspace,
} from './SoftwareAgentWorkspace.js';

import {
  checkpointChangesFromWorkspace,
  checkpointMatchesExecution,
  softwareAgentBaseFingerprint,
  workingFilesFromCheckpoint,
  type SoftwareAgentCheckpointStatus,
  type SoftwareAgentCheckpointStore,
} from './softwareAgentCheckpoint.js';

export interface SoftwareAgentServiceInput {
  contract:
    SoftwareExecutionContract;

  bindings:
    XrogaSoftwareAgentBindings;

  model:
    SoftwareAgentModelRoute;

  events:
    SoftwareRunEventSink;

  initialFiles?: Array<{
    path: string;
    content: string;
  }>;

  signal?:
    AbortSignal;

  /**
   * Optional durable checkpoint store.
   *
   * Production supplies Supabase.
   */
  checkpointStore?:
    SoftwareAgentCheckpointStore;
}

export interface SoftwareAgentServiceResult
  extends
    AgentSoftwareExecutorResult {
  workspace:
    SoftwareAgentWorkspace;
}

function checkpointStatusFor(
  status:
    AgentSoftwareExecutorResult[
      'status'
    ],
): SoftwareAgentCheckpointStatus {
  switch (
    status
  ) {
    case 'verified':
      return 'verified';

    case 'incomplete':
      return 'incomplete';

    case 'cancelled':
      return 'cancelled';

    case 'failed':
    default:
      return 'failed';
  }
}

export class SoftwareAgentService {
  private readonly executor:
    AgentSoftwareExecutor;

  constructor(
    executor =
      new AgentSoftwareExecutor(),
  ) {
    this.executor =
      executor;
  }

  async execute(
    input:
      SoftwareAgentServiceInput,
  ): Promise<
    SoftwareAgentServiceResult
  > {
    const {
      contract,
      bindings,
      model,
      events,
    } = input;

    const dependencies =
      createXrogaProductionDependencies(
        bindings,
      );

    /*
     * Universal execution always supplies this exact repository snapshot.
     *
     * Checkpoint recovery deliberately requires a known base. A direct
     * caller that supplies no initial snapshot still works normally, but
     * checkpoint replay is disabled because Xroga could not prove what
     * base the checkpoint belongs to.
     */
    const baseFiles =
      input.initialFiles !==
      undefined
        ? input
            .initialFiles
            .map(
              (
                file,
              ) => ({
                path:
                  file.path,

                content:
                  file.content,
              }),
            )
        : null;

    let restoredCheckpoint:
      Awaited<
        ReturnType<
          NonNullable<
            SoftwareAgentServiceInput[
              'checkpointStore'
            ]
          >[
            'load'
          ]
        >
      > =
      null;

    if (
      input.checkpointStore &&
      baseFiles
    ) {
      try {
        const candidate =
          await input
            .checkpointStore
            .load(
              contract.runId,
            );

        if (
          candidate &&
          checkpointMatchesExecution(
            candidate,

            {
              contract,
              baseFiles,
            },
          )
        ) {
          restoredCheckpoint =
            candidate;
        } else if (
          candidate
        ) {
          console.warn(
            '[software_agent_checkpoint_ignored]',
            JSON.stringify({
              runId:
                contract.runId,

              reason:
                'checkpoint base/project/repository identity no longer matches the authorized run-start snapshot',
            }),
          );
        }
      } catch (
        error
      ) {
        /*
         * Checkpoint infrastructure must never turn a usable software
         * build into a failed build. It is a resilience layer.
         */
        console.warn(
          '[software_agent_checkpoint_load_failed]',
          error instanceof
          Error
            ? error.message
            : String(
                error,
              ),
        );
      }
    }

    const restoredWorkingFiles =
      baseFiles &&
      restoredCheckpoint
        ? workingFilesFromCheckpoint(
            baseFiles,
            restoredCheckpoint,
          )
        : undefined;

    const {
      operations,
      workspace,
    } =
      await createProductionSoftwareAgentOperations(
        contract,
        dependencies,

        {
          ...(
            input.initialFiles !==
            undefined
              ? {
                  initialFiles:
                    input.initialFiles,
                }
              : {}
          ),

          ...(
            restoredWorkingFiles
              ? {
                  workingFiles:
                    restoredWorkingFiles,
                }
              : {}
          ),
        },
      );

    const host =
      createProductionSoftwareAgentToolHost(
        operations,
      );

    const initialEvidence:
      SoftwareRunEvidence =
      restoredCheckpoint
        ? structuredClone(
            restoredCheckpoint
              .evidence,
          )
        : createAgentEvidence();

    /*
     * Defensive recovery:
     *
     * If a process died after the workspace mutation became durable but
     * before the corresponding evidence checkpoint completed, reconstruct
     * the minimum changed-file evidence from the durable workspace diff.
     */
    if (
      restoredCheckpoint &&
      workspace.hasChanges() &&
      initialEvidence
        .changedFiles
        .length ===
        0
    ) {
      initialEvidence
        .changedFiles
        .push(
          ...workspace
            .getChanges()
            .map(
              (
                change,
              ) => ({
                path:
                  change.path,

                created:
                  change.kind ===
                  'created',

                deleted:
                  change.kind ===
                  'deleted',
              }),
            ),
        );
    }

    const persistCheckpoint =
      async (
        evidence:
          SoftwareRunEvidence,

        status:
          SoftwareAgentCheckpointStatus,

        blockers:
          readonly string[] =
          [],

        failureCode:
          string |
          null =
          null,
      ) => {
        if (
          !input.checkpointStore ||
          !baseFiles
        ) {
          return;
        }

        try {
          await input
            .checkpointStore
            .save({
              schemaVersion:
                '1.0.0',

              runId:
                contract.runId,

              projectId:
                contract.projectId ??
                null,

              repository:
                contract.repository
                  ? {
                      owner:
                        contract
                          .repository
                          .owner,

                      repo:
                        contract
                          .repository
                          .repo,

                      branch:
                        contract
                          .repository
                          .branch,

                      ...(
                        contract
                          .repository
                          .sourceCommit
                          ? {
                              sourceCommit:
                                contract
                                  .repository
                                  .sourceCommit,
                            }
                          : {}
                      ),
                    }
                  : null,

              baseFingerprint:
                softwareAgentBaseFingerprint(
                  baseFiles,
                ),

              changes:
                checkpointChangesFromWorkspace(
                  workspace
                    .getChanges(),
                ),

              evidence:
                structuredClone(
                  evidence,
                ),

              status,

              blockers: [
                ...blockers,
              ],

              failureCode,

              updatedAt:
                new Date()
                  .toISOString(),
            });
        } catch (
          error
        ) {
          console.warn(
            '[software_agent_checkpoint_save_failed]',
            error instanceof
            Error
              ? error.message
              : String(
                  error,
                ),
          );
        }
      };

    /*
     * Make the resumed/current workspace durable before asking the
     * model to do more work.
     */
    await persistCheckpoint(
      initialEvidence,
      'active',
    );

    const result =
      await this
        .executor
        .execute({
          contract,
          host,
          events,
          model,

          signal:
            input.signal,

          initialEvidence,

          resumedFromCheckpoint:
            Boolean(
              restoredCheckpoint,
            ),

          checkpoint:
            async (
              evidence,
            ) =>
              persistCheckpoint(
                evidence,
                'active',
              ),
        });

    await persistCheckpoint(
      result.evidence,

      checkpointStatusFor(
        result.status,
      ),

      result.blockers,

      result.failureCode ??
      null,
    );

    return {
      ...result,
      workspace,
    };
  }
}

export async function runSoftwareAgent(
  input:
    SoftwareAgentServiceInput,
): Promise<
  SoftwareAgentServiceResult
> {
  const service =
    new SoftwareAgentService();

  return service.execute(
    input,
  );
}
