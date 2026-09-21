import {
  createTool,
} from '@cline/sdk';

import {
  redactSecrets,
} from '../../lib/truthfulExecution.js';

import type {
  SoftwareExecutionContract,
  SoftwareFileRevision,
  SoftwareRunEvidence,
} from './contracts.js';

import {
  evaluateSoftwareCompletion,
} from './completionGate.js';

import {
  evaluateWritePolicy,
} from './writePolicy.js';

import type {
  SoftwareRunEventSink,
} from './runEvents.js';

import type {
  FileWriteIntent,
  SoftwareAgentToolHost,
} from './toolHost.js';

interface CreateXrogaSoftwareToolsInput {
  contract: SoftwareExecutionContract;
  host: SoftwareAgentToolHost;
  events: SoftwareRunEventSink;
  evidence: SoftwareRunEvidence;
}

const MAX_PUBLIC_COMMAND_OUTPUT = 4_000;

function id(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

function upsertChangedFile(
  evidence: SoftwareRunEvidence,
  next: SoftwareFileRevision,
): void {
  const existing =
    evidence.changedFiles.find(
      (file) =>
        file.path === next.path,
    );

  if (!existing) {
    evidence.changedFiles.push(
      next,
    );

    return;
  }

  Object.assign(
    existing,
    {
      ...next,

      created:
        existing.created === true ||
        next.created === true,
    },
  );
}

/**
 * Terminal activity is user-visible evidence.
 *
 * Never stream raw command output into run events. The tool result may remain
 * available to the software agent, but public events are redacted and bounded
 * before they leave the backend.
 */
function publicCommandOutput(
  value: string,
): string | null {
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
    return null;
  }

  if (
    clean.length <=
    MAX_PUBLIC_COMMAND_OUTPUT
  ) {
    return clean;
  }

  return (
    clean.slice(
      0,
      MAX_PUBLIC_COMMAND_OUTPUT,
    ) +
    '\n…output truncated'
  );
}

export function createXrogaSoftwareTools(
  input: CreateXrogaSoftwareToolsInput,
) {
  const {
    contract,
    host,
    events,
    evidence,
  } = input;

  let sequence = 0;

  const emit = async (
    event: Omit<
      Parameters<
        SoftwareRunEventSink['emit']
      >[0],
      | 'id'
      | 'runId'
      | 'sequence'
      | 'createdAt'
    >,
  ) => {
    sequence += 1;

    await events.emit({
      id: id(),
      runId:
        contract.runId,
      sequence,
      createdAt:
        now(),
      ...event,
    });
  };

  const listFiles =
    createTool({
      name:
        'project_list_files',

      description:
        'List files in the authorized Xroga project. Use this before assuming the project structure.',

      inputSchema: {
        type:
          'object',
        properties:
          {},
        additionalProperties:
          false,
      },

      execute:
        async () => {
          try {
            const files =
              await host.listFiles(
                contract,
              );

            await emit({
              type:
                'project.inspect.completed',

              status:
                'success',

              title:
                'Inspected project',

              summary:
                `${files.length} file${
                  files.length === 1
                    ? ''
                    : 's'
                } available`,
            });

            return {
              ok:
                true,
              files,
            };
          } catch {
            return {
              ok:
                false,

              code:
                'PROJECT_LIST_FAILED',

              message:
                'Xroga could not list the project files.',
            };
          }
        },
    });

  const readFiles =
    createTool({
      name:
        'project_read_files',

      description:
        'Read one or more authorized project files. Read relevant existing code before modifying it.',

      inputSchema: {
        type:
          'object',

        properties: {
          paths: {
            type:
              'array',

            items: {
              type:
                'string',
            },

            minItems:
              1,

            maxItems:
              20,
          },
        },

        required: [
          'paths',
        ],

        additionalProperties:
          false,
      },

      execute:
        async (
          rawInput: unknown,
        ) => {
          const toolInput =
            rawInput as {
              paths:
                string[];
            };

          try {
            const files =
              await host.readFiles(
                contract,
                toolInput.paths,
              );

            for (
              const file of
              files
            ) {
              await emit({
                type:
                  'file.read',

                status:
                  'success',

                title:
                  `Read ${file.path}`,

                evidence: {
                  filePath:
                    file.path,
                },
              });
            }

            return {
              ok:
                true,
              files,
            };
          } catch {
            return {
              ok:
                false,

              code:
                'PROJECT_READ_FAILED',

              message:
                'Xroga could not read one or more requested project files.',
            };
          }
        },
    });

  const searchProject =
    createTool({
      name:
        'project_search',

      description:
        'Search the authorized project for symbols, text, imports, routes, functions, or configuration.',

      inputSchema: {
        type:
          'object',

        properties: {
          query: {
            type:
              'string',

            minLength:
              1,
          },
        },

        required: [
          'query',
        ],

        additionalProperties:
          false,
      },

      execute:
        async (
          rawInput: unknown,
        ) => {
          const toolInput =
            rawInput as {
              query:
                string;
            };

          try {
            const results =
              await host.searchProject(
                contract,
                toolInput.query,
              );

            return {
              ok:
                true,
              results,
            };
          } catch {
            return {
              ok:
                false,

              code:
                'PROJECT_SEARCH_FAILED',

              message:
                'Project search failed.',
            };
          }
        },
    });

  const writeFile =
    createTool({
      name:
        'project_write_file',

      description:
        'Create or modify exactly one authorized project file. Declare create for a new path and modify for an existing path. Xroga independently verifies the declared intent against the real workspace.',

      inputSchema: {
        type:
          'object',

        properties: {
          path: {
            type:
              'string',

            minLength:
              1,
          },

          content: {
            type:
              'string',
          },

          intent: {
            type:
              'string',

            enum: [
              'create',
              'modify',
            ],

            description:
              'Whether this operation creates a new file or modifies an existing file.',
          },
        },

        required: [
          'path',
          'content',
          'intent',
        ],

        additionalProperties:
          false,
      },

      execute:
        async (
          rawInput: unknown,
        ) => {
          const toolInput =
            rawInput as {
              path:
                string;

              content:
                string;

              intent:
                FileWriteIntent;
            };

          const decision =
            evaluateWritePolicy(
              contract.writePolicy,
              toolInput.intent,
              toolInput.path,
            );

          if (
            !decision.allowed
          ) {
            return {
              ok:
                false,

              code:
                decision.code ??
                'WRITE_SCOPE_DENIED',

              message:
                decision.message ??
                'The requested file is outside the authorized write scope.',
            };
          }

          try {
            const result =
              await host.writeFile(
                contract,
                toolInput.path,
                toolInput.content,
                toolInput.intent,
              );

            upsertChangedFile(
              evidence,
              {
                path:
                  result.path,

                revision:
                  result.revision,

                additions:
                  result.additions,

                deletions:
                  result.deletions,

                created:
                  result.created,

                deleted:
                  false,
              },
            );

            await emit({
              type:
                result.created
                  ? 'file.created'
                  : 'file.updated',

              status:
                'success',

              title:
                result.created
                  ? `Created ${result.path}`
                  : `Updated ${result.path}`,

              evidence: {
                filePath:
                  result.path,

                fileRevision:
                  result.revision,
              },
            });

            return {
              ok:
                true,

              ...result,
            };
          } catch (
            error
          ) {
            const message =
              error instanceof
              Error
                ? error.message
                : 'Xroga could not safely apply this file change.';

            const code =
              message.startsWith(
                'CREATE_CONFLICT:',
              )
                ? 'CREATE_CONFLICT'
                : message.startsWith(
                      'MODIFY_TARGET_MISSING:',
                    )
                  ? 'MODIFY_TARGET_MISSING'
                  : 'FILE_WRITE_FAILED';

            return {
              ok:
                false,
              code,
              message,
            };
          }
        },
    });

  const deleteFile =
    createTool({
      name:
        'project_delete_file',

      description:
        'Delete a project file only when the task explicitly authorizes deletion.',

      inputSchema: {
        type:
          'object',

        properties: {
          path: {
            type:
              'string',

            minLength:
              1,
          },
        },

        required: [
          'path',
        ],

        additionalProperties:
          false,
      },

      execute:
        async (
          rawInput: unknown,
        ) => {
          const toolInput =
            rawInput as {
              path:
                string;
            };

          const decision =
            evaluateWritePolicy(
              contract.writePolicy,
              'delete',
              toolInput.path,
            );

          if (
            !decision.allowed
          ) {
            return {
              ok:
                false,

              code:
                decision.code ??
                'DELETE_SCOPE_DENIED',

              message:
                decision.message ??
                'Deletion is not authorized.',
            };
          }

          try {
            const result =
              await host.deleteFile(
                contract,
                toolInput.path,
              );

            if (
              result.deleted
            ) {
              upsertChangedFile(
                evidence,
                {
                  path:
                    result.path,

                  deleted:
                    true,
                },
              );

              await emit({
                type:
                  'file.deleted',

                status:
                  'success',

                title:
                  `Deleted ${result.path}`,

                evidence: {
                  filePath:
                    result.path,
                },
              });
            }

            return {
              ok:
                true,

              ...result,
            };
          } catch {
            return {
              ok:
                false,

              code:
                'FILE_DELETE_FAILED',

              message:
                'Xroga could not safely delete this file.',
            };
          }
        },
    });

  const renameFile =
  createTool({
    name:
      'project_rename_file',

    description:
      'Rename or move exactly one project file when the execution contract authorizes renaming.',

    inputSchema: {
      type:
        'object',

      properties: {
        fromPath: {
          type:
            'string',

          minLength:
            1,
        },

        toPath: {
          type:
            'string',

          minLength:
            1,
        },
      },

      required: [
        'fromPath',
        'toPath',
      ],

      additionalProperties:
        false,
    },

    execute:
      async (
        rawInput:
          unknown,
      ) => {
        const toolInput =
          rawInput as {
            fromPath:
              string;

            toPath:
              string;
          };

        const sourceDecision =
          evaluateWritePolicy(
            contract.writePolicy,
            'rename',
            toolInput.fromPath,
          );

        const targetDecision =
          evaluateWritePolicy(
            contract.writePolicy,
            'rename',
            toolInput.toPath,
          );

        if (
          !sourceDecision.allowed ||
          !targetDecision.allowed
        ) {
          const decision =
            !sourceDecision.allowed
              ? sourceDecision
              : targetDecision;

          return {
            ok:
              false,

            code:
              decision.code ??
              'RENAME_SCOPE_DENIED',

            message:
              decision.message ??
              'Rename is not authorized.',
          };
        }

        try {
          const result =
            await host.renameFile(
              contract,
              toolInput.fromPath,
              toolInput.toPath,
            );

          if (
            result.renamed
          ) {
            upsertChangedFile(
              evidence,
              {
                path:
                  result.fromPath,

                deleted:
                  true,
              },
            );

            upsertChangedFile(
              evidence,
              {
                path:
                  result.toPath,

                revision:
                  result.revision,

                created:
                  true,

                deleted:
                  false,
              },
            );

            await emit({
              type:
                'file.renamed',

              status:
                'success',

              title:
                `Renamed ${result.fromPath} → ${result.toPath}`,

              evidence: {
                filePath:
                  result.toPath,

                fileRevision:
                  result.revision,
              },
            });
          }

          return {
            ok:
              true,

            ...result,
          };
        } catch (
          error
        ) {
          const message =
            error instanceof
              Error
              ? error.message
              : 'Xroga could not safely rename this file.';

          return {
            ok:
              false,

            code:
              message.startsWith(
                'RENAME_SOURCE_MISSING:',
              )
                ? 'RENAME_SOURCE_MISSING'
                : message.startsWith(
                      'RENAME_TARGET_EXISTS:',
                    )
                  ? 'RENAME_TARGET_EXISTS'
                  : 'FILE_RENAME_FAILED',

            message,
          };
        }
      },
  });
  
  const runCommand =
    createTool({
      name:
        'run_command',

      description:
        'Run a project command inside the isolated Xroga execution environment. Use project-defined scripts and tooling where possible.',

      inputSchema: {
        type:
          'object',

        properties: {
          command: {
            type:
              'string',

            minLength:
              1,
          },
        },

        required: [
          'command',
        ],

        additionalProperties:
          false,
      },

      execute:
        async (
          rawInput: unknown,
        ) => {
          const toolInput =
            rawInput as {
              command:
                string;
            };

          await emit({
            type:
              'command.started',

            status:
              'running',

            title:
              'Running command',

            summary:
              redactSecrets(
                toolInput.command,
              ),
          });

          try {
            const result =
              await host.runCommand(
                contract,
                toolInput.command,
              );

            const stdout =
              publicCommandOutput(
                result.stdout,
              );

            if (
              stdout
            ) {
              await emit({
                type:
                  'command.output',

                status:
                  'running',

                title:
                  'Command output',

                summary:
                  stdout,

                evidence: {
                  commandId:
                    result.commandId,
                },
              });
            }

            const stderr =
              publicCommandOutput(
                result.stderr,
              );

            if (
              stderr
            ) {
              await emit({
                type:
                  'command.output',

                status:
                  'running',

                title:
                  'Command error output',

                summary:
                  stderr,

                evidence: {
                  commandId:
                    result.commandId,
                },
              });
            }

            await emit({
              type:
                'command.completed',

              status:
                result.exitCode ===
                0
                  ? 'success'
                  : 'failed',

              title:
                result.exitCode ===
                0
                  ? 'Command completed'
                  : 'Command failed',

              summary:
                redactSecrets(
                  toolInput.command,
                ),

              evidence: {
                commandId:
                  result.commandId,

                exitCode:
                  result.exitCode,

                durationMs:
                  result.durationMs,
              },
            });

            return {
              ok:
                result.exitCode ===
                0,

              ...result,
            };
          } catch {
            return {
              ok:
                false,

              code:
                'COMMAND_EXECUTION_FAILED',

              message:
                'The command could not be executed in the Xroga sandbox.',
            };
          }
        },
    });

  const runChecks =
    createTool({
      name:
        'run_checks',

      description:
        'Ask Xroga to detect and run the appropriate deterministic checks for the current project.',

      inputSchema: {
        type:
          'object',

        properties:
          {},

        additionalProperties:
          false,
      },

      execute:
        async () => {
          await emit({
            type:
              'check.started',

            status:
              'running',

            title:
              'Running project checks',
          });

          try {
            const checks =
              await host.runChecks(
                contract,
              );

            evidence.checks.splice(
              0,
              evidence.checks.length,
              ...checks,
            );

            if (
              checks.length ===
              0
            ) {
              await emit({
                type:
                  'check.completed',

                status:
                  'failed',

                title:
                  'No project checks were available',

                summary:
                  'Verification requires at least one deterministic project check.',
              });

              return {
                ok:
                  false,

                code:
                  'NO_PROJECT_CHECKS',

                message:
                  'Xroga could not verify this project because no deterministic checks were available.',

                checks,
              };
            }

            const failed =
              checks.filter(
                (check) =>
                  check.status ===
                  'failed',
              );

            await emit({
              type:
                'check.completed',

              status:
                failed.length ===
                0
                  ? 'success'
                  : 'failed',

              title:
                failed.length ===
                0
                  ? 'Project checks passed'
                  : `${failed.length} project check${
                      failed.length === 1
                        ? ''
                        : 's'
                    } failed`,
            });

            return {
              ok:
                failed.length ===
                0,

              checks,
            };
          } catch {
            return {
              ok:
                false,

              code:
                'CHECK_EXECUTION_FAILED',

              message:
                'Xroga could not complete the project checks.',
            };
          }
        },
    });

  const gitDiff =
    createTool({
      name:
        'git_diff',

      description:
        'Inspect the authoritative project diff and changed-file list.',

      inputSchema: {
        type:
          'object',

        properties:
          {},

        additionalProperties:
          false,
      },

      execute:
        async () => {
          try {
            const diff =
              await host.gitDiff(
                contract,
              );

            return {
              ok:
                true,

              ...diff,
            };
          } catch {
            return {
              ok:
                false,

              code:
                'DIFF_FAILED',

              message:
                'Xroga could not calculate the project diff.',
            };
          }
        },
    });

  const verifyPreview =
    createTool({
      name:
        'verify_preview',

      description:
        'Run Xroga browser/runtime verification against the current workspace. The application and browser run together inside one disposable isolated sandbox; no persistent Preview id exists.',

      inputSchema: {
        type:
          'object',

        properties:
          {},

        additionalProperties:
          false,
      },

      execute:
        async () => {
          if (
            contract.preview ===
            'not_applicable'
          ) {
            return {
              ok:
                false,

              code:
                'PREVIEW_NOT_APPLICABLE',

              message:
                'This software task does not require browser Preview verification.',
            };
          }

          await emit({
            type:
              'preview.starting',

            status:
              'running',

            title:
              'Starting isolated Preview verification',
          });

          await emit({
            type:
              'browser.verification.started',

            status:
              'running',

            title:
              'Verifying application in browser',
          });

          try {
            const preview =
              await host.verifyPreview(
                contract,
              );

            evidence.preview =
              preview;

            const valid =
              preview.status ===
              'passed';

            if (
              valid
            ) {
              await emit({
                type:
                  'preview.ready',

                status:
                  'success',

                title:
                  'Preview verified',
              });
            } else {
              await emit({
                type:
                  'preview.failed',

                status:
                  'failed',

                title:
                  preview.status ===
                  'not_checked'
                    ? 'Preview verification did not run'
                    : 'Preview verification failed',

                summary:
                  preview.blocker ??
                  undefined,
              });
            }

            await emit({
              type:
                'browser.verification.completed',

              status:
                valid
                  ? 'success'
                  : 'failed',

              title:
                valid
                  ? 'Browser verification passed'
                  : 'Browser verification incomplete',

              summary:
                valid
                  ? undefined
                  : preview.blocker ??
                    'Required browser evidence is incomplete.',
            });

            return {
              ok:
                valid,

              preview,

              ...(
                valid
                  ? {}
                  : {
                      code:
                        preview.status ===
                        'not_checked'
                          ? 'PREVIEW_NOT_CHECKED'
                          : 'PREVIEW_VERIFICATION_FAILED',

                      message:
                        preview.blocker ??
                        'The application did not produce passing browser verification evidence.',
                    }
              ),
            };
          } catch {
            await emit({
              type:
                'preview.failed',

              status:
                'failed',

              title:
                'Preview verification could not run',
            });

            await emit({
              type:
                'browser.verification.completed',

              status:
                'failed',

              title:
                'Browser verification failed to execute',
            });

            return {
              ok:
                false,

              code:
                'PREVIEW_VERIFICATION_FAILED',

              message:
                'Xroga could not complete browser verification.',
            };
          }
        },
    });

  const createReviewBranch =
    createTool({
      name:
        'create_review_branch',

      description:
        'Persist verified project changes to an authorized review branch. This tool does not merge or deploy.',

      inputSchema: {
        type:
          'object',

        properties:
          {},

        additionalProperties:
          false,
      },

      execute:
        async () => {
          if (
            !contract.repository
          ) {
            return {
              ok:
                false,

              code:
                'NO_REPOSITORY',

              message:
                'There is no authorized repository for this task.',
            };
          }

          if (
            contract.persistence !==
            'review_branch'
          ) {
            return {
              ok:
                false,

              code:
                'REPOSITORY_PERSISTENCE_NOT_AUTHORIZED',

              message:
                'This task is not authorized to persist repository changes.',
            };
          }

          const verification =
  evaluateSoftwareCompletion({
    previewRequirement:
      contract.preview,

    verificationAuthority:
      contract.verificationAuthority,

    evidence,

    requireSuccessfulChecks:
      contract
        .verificationAuthority ===
      'agent',

    requireRepositoryPersistence:
      false,
  });

          if (
            !verification.complete
          ) {
            return {
              ok:
                false,

              code:
                'VERIFICATION_REQUIRED',

              message:
                'Xroga will not persist unverified software changes.',

              blockers:
                verification.blockers,
            };
          }

          try {
            const result =
              await host.createReviewBranch(
                contract,
              );

            evidence.branch =
              result.branch;

            evidence.commitSha =
              result.commitSha;

            await emit({
              type:
                'git.branch.created',

              status:
                'success',

              title:
                `Prepared ${result.branch}`,
            });

            await emit({
              type:
                'git.commit.created',

              status:
                'success',

              title:
                'Saved verified changes',

              evidence: {
                commitSha:
                  result.commitSha,
              },
            });

            return {
              ok:
                true,

              ...result,
            };
          } catch {
            return {
              ok:
                false,

              code:
                'REPOSITORY_PERSIST_FAILED',

              message:
                'Xroga could not persist the verified changes.',
            };
          }
        },
    });

  const completeTask =
    createTool({
      name:
        'complete_task',

      description:
        'Finish the software task only when Xroga verification evidence proves the requested outcome is complete.',

      inputSchema: {
        type:
          'object',

        properties: {
          summary: {
            type:
              'string',
          },
        },

        required: [
          'summary',
        ],

        additionalProperties:
          false,
      },

      lifecycle: {
        completesRun:
          true,
      },

      execute:
        async (
          rawInput: unknown,
        ) => {
          const toolInput =
            rawInput as {
              summary:
                string;
            };

          const result =
  evaluateSoftwareCompletion({
    previewRequirement:
      contract.preview,

    verificationAuthority:
      contract.verificationAuthority,

    evidence,

    requireSuccessfulChecks:
      contract
        .verificationAuthority ===
      'agent',

    requireRepositoryPersistence:
      contract
        .verificationAuthority ===
        'agent' &&
      contract.persistence ===
        'review_branch',
  });

          if (
            !result.complete
          ) {
            return {
              ok:
                false,

              completed:
                false,

              blockers:
                result.blockers,

              message:
                'The task is not verified yet.',
            };
          }

          await emit({
            type:
              'run.completed',

            status:
              'success',

            title:
              'Software task completed',

            summary:
              toolInput.summary,
          });

          return {
            ok:
              true,

            completed:
              true,

            summary:
              toolInput.summary,

            evidence,
          };
        },
    });

  const implementationTools = [
  listFiles,
  readFiles,
  searchProject,
  writeFile,
  deleteFile,
  renameFile,
  runCommand,
  gitDiff,
];

const agentVerifiedTools = [
  ...implementationTools,
  runChecks,
  verifyPreview,
  createReviewBranch,
];

return {
  tools:
    contract
      .verificationAuthority ===
      'universal'
      ? implementationTools
      : agentVerifiedTools,

  completionTool:
    completeTask,
};
}
