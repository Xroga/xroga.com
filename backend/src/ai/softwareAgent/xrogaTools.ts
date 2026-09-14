import { createTool } from '@cline/sdk';

import type {
  SoftwareExecutionContract,
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
  SoftwareAgentToolHost,
} from './toolHost.js';

interface CreateXrogaSoftwareToolsInput {
  contract: SoftwareExecutionContract;

  host: SoftwareAgentToolHost;

  events: SoftwareRunEventSink;

  evidence: SoftwareRunEvidence;
}

function id(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
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
      Parameters<SoftwareRunEventSink['emit']>[0],
      'id' | 'runId' | 'sequence' | 'createdAt'
    >,
  ) => {
    sequence += 1;

    await events.emit({
      id: id(),
      runId: contract.runId,
      sequence,
      createdAt: now(),
      ...event,
    });
  };

  const listFiles = createTool({
    name: 'project_list_files',

    description:
      'List files in the authorized Xroga project. Use this before assuming the project structure.',

    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },

    execute: async () => {
      try {
        const files =
          await host.listFiles(
            contract,
          );

        await emit({
          type: 'project.inspect.completed',
          status: 'success',
          title: 'Inspected project',
          summary: `${files.length} file${
            files.length === 1
              ? ''
              : 's'
          } available`,
        });

        return {
          ok: true,
          files,
        };
      } catch {
        return {
          ok: false,
          code: 'PROJECT_LIST_FAILED',
          message:
            'Xroga could not list the project files.',
        };
      }
    },
  });

  const readFiles = createTool({
    name: 'project_read_files',

    description:
      'Read one or more authorized project files. Read relevant existing code before modifying it.',

    inputSchema: {
      type: 'object',

      properties: {
        paths: {
          type: 'array',

          items: {
            type: 'string',
          },

          minItems: 1,
          maxItems: 20,
        },
      },

      required: ['paths'],

      additionalProperties: false,
    },

    execute: async (
      rawInput,
    ) => {
      const input =
        rawInput as {
          paths: string[];
        };

      try {
        const files =
          await host.readFiles(
            contract,
            input.paths,
          );

        for (
          const file of files
        ) {
          await emit({
            type: 'file.read',
            status: 'success',
            title:
              `Read ${file.path}`,

            evidence: {
              filePath:
                file.path,
            },
          });
        }

        return {
          ok: true,
          files,
        };
      } catch {
        return {
          ok: false,
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
      name: 'project_search',

      description:
        'Search the authorized project for symbols, text, imports, routes, functions, or configuration.',

      inputSchema: {
        type: 'object',

        properties: {
          query: {
            type: 'string',
            minLength: 1,
          },
        },

        required: ['query'],

        additionalProperties:
          false,
      },

      execute: async (
        rawInput,
      ) => {
        const input =
          rawInput as {
            query: string;
          };

        try {
          const results =
            await host.searchProject(
              contract,
              input.query,
            );

          return {
            ok: true,
            results,
          };
        } catch {
          return {
            ok: false,
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
        'Create or replace one authorized project file. Read existing files first when modifying them.',

      inputSchema: {
        type: 'object',

        properties: {
          path: {
            type: 'string',
            minLength: 1,
          },

          content: {
            type: 'string',
          },
        },

        required: [
          'path',
          'content',
        ],

        additionalProperties:
          false,
      },

      execute: async (
        rawInput,
      ) => {
        const input =
          rawInput as {
            path: string;
            content: string;
          };

        const modifyDecision =
          evaluateWritePolicy(
            contract.writePolicy,
            'modify',
            input.path,
          );

        if (
          !modifyDecision.allowed
        ) {
          const createDecision =
            evaluateWritePolicy(
              contract.writePolicy,
              'create',
              input.path,
            );

          if (
            !createDecision.allowed
          ) {
            return {
              ok: false,

              code:
                createDecision.code ??
                modifyDecision.code ??
                'WRITE_SCOPE_DENIED',

              message:
                createDecision.message ??
                modifyDecision.message ??
                'The requested file is outside the authorized write scope.',
            };
          }
        }

        try {
          const result =
            await host.writeFile(
              contract,
              input.path,
              input.content,
            );

          const previous =
            evidence.changedFiles.find(
              (file) =>
                file.path ===
                result.path,
            );

          if (previous) {
            Object.assign(
              previous,
              {
                revision:
                  result.revision,

                additions:
                  result.additions,

                deletions:
                  result.deletions,

                created:
                  result.created,
              },
            );
          } else {
            evidence.changedFiles.push(
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
              },
            );
          }

          await emit({
            type: result.created
              ? 'file.created'
              : 'file.updated',

            status: 'success',

            title: result.created
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
            ok: true,
            ...result,
          };
        } catch {
          return {
            ok: false,

            code:
              'FILE_WRITE_FAILED',

            message:
              'Xroga could not safely apply this file change.',
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
        type: 'object',

        properties: {
          path: {
            type: 'string',
            minLength: 1,
          },
        },

        required: ['path'],

        additionalProperties:
          false,
      },

      execute: async (
        rawInput,
      ) => {
        const input =
          rawInput as {
            path: string;
          };

        const decision =
          evaluateWritePolicy(
            contract.writePolicy,
            'delete',
            input.path,
          );

        if (
          !decision.allowed
        ) {
          return {
            ok: false,

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
              input.path,
            );

          if (
            result.deleted
          ) {
            evidence.changedFiles.push(
              {
                path:
                  result.path,
                deleted: true,
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
            ok: true,
            ...result,
          };
        } catch {
          return {
            ok: false,

            code:
              'FILE_DELETE_FAILED',

            message:
              'Xroga could not safely delete this file.',
          };
        }
      },
    });

  const runCommand =
    createTool({
      name: 'run_command',

      description:
        'Run a project command inside the isolated Xroga execution environment. Use project-defined scripts and tooling where possible.',

      inputSchema: {
        type: 'object',

        properties: {
          command: {
            type: 'string',
            minLength: 1,
          },
        },

        required: [
          'command',
        ],

        additionalProperties:
          false,
      },

      execute: async (
        rawInput,
      ) => {
        const input =
          rawInput as {
            command: string;
          };

        await emit({
          type:
            'command.started',

          status: 'running',

          title:
            'Running command',

          summary:
            input.command,
        });

        try {
          const result =
            await host.runCommand(
              contract,
              input.command,
            );

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
              input.command,

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
            ok: false,

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
      name: 'run_checks',

      description:
        'Ask Xroga to detect and run the appropriate deterministic checks for the current project.',

      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties:
          false,
      },

      execute: async () => {
        await emit({
          type:
            'check.started',

          status: 'running',

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
              failed.length === 0
                ? 'success'
                : 'failed',

            title:
              failed.length === 0
                ? 'Project checks passed'
                : `${failed.length} project check${
                    failed.length ===
                    1
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
            ok: false,

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
      name: 'git_diff',

      description:
        'Inspect the authoritative project diff and changed-file list.',

      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties:
          false,
      },

      execute: async () => {
        try {
          const diff =
            await host.gitDiff(
              contract,
            );

          return {
            ok: true,
            ...diff,
          };
        } catch {
          return {
            ok: false,

            code:
              'DIFF_FAILED',

            message:
              'Xroga could not calculate the project diff.',
          };
        }
      },
    });

  const startPreview =
    createTool({
      name:
        'start_preview',

      description:
        'Start the real application Preview when this project supports Preview.',

      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties:
          false,
      },

      execute: async () => {
        if (
          contract.preview ===
          'not_applicable'
        ) {
          return {
            ok: false,

            code:
              'PREVIEW_NOT_APPLICABLE',

            message:
              'This software task does not require a web Preview.',
          };
        }

        await emit({
          type:
            'preview.starting',

          status: 'running',

          title:
            'Starting Preview',
        });

        try {
          const preview =
            await host.startPreview(
              contract,
            );

          evidence.preview =
            preview;

          await emit({
            type:
              'preview.ready',

            status:
              'success',

            title:
              'Preview ready',

            evidence: {
              previewId:
                preview.previewId,
            },
          });

          return {
            ok: true,
            preview,
          };
        } catch {
          await emit({
            type:
              'preview.failed',

            status: 'failed',

            title:
              'Preview could not start',
          });

          return {
            ok: false,

            code:
              'PREVIEW_START_FAILED',

            message:
              'The application Preview could not start.',
          };
        }
      },
    });

  const verifyPreview =
    createTool({
      name:
        'verify_preview',

      description:
        'Verify the running Preview using Xroga browser/runtime checks.',

      inputSchema: {
        type: 'object',

        properties: {
          preview_id: {
            type: 'string',
            minLength: 1,
          },
        },

        required: [
          'preview_id',
        ],

        additionalProperties:
          false,
      },

      execute: async (
        rawInput,
      ) => {
        const input =
          rawInput as {
            preview_id: string;
          };

        await emit({
          type:
            'browser.verification.started',

          status: 'running',

          title:
            'Verifying Preview',

          evidence: {
            previewId:
              input.preview_id,
          },
        });

        try {
          const preview =
            await host.verifyPreview(
              contract,
              input.preview_id,
            );

          evidence.preview =
            preview;

          const valid =
            typeof preview.httpStatus ===
              'number' &&
            preview.httpStatus >=
              200 &&
            preview.httpStatus <
              400 &&
            preview.consoleErrors
              .length === 0 &&
            preview.runtimeErrors
              .length === 0;

          await emit({
            type:
              'browser.verification.completed',

            status: valid
              ? 'success'
              : 'failed',

            title: valid
              ? 'Preview verified'
              : 'Preview needs attention',

            evidence: {
              previewId:
                input.preview_id,
            },
          });

          return {
            ok: valid,
            preview,
          };
        } catch {
          return {
            ok: false,

            code:
              'PREVIEW_VERIFICATION_FAILED',

            message:
              'Xroga could not complete Preview verification.',
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
        type: 'object',
        properties: {},
        additionalProperties:
          false,
      },

      execute: async () => {
        if (
          !contract.repository
        ) {
          return {
            ok: false,

            code:
              'NO_REPOSITORY',

            message:
              'There is no authorized repository for this task.',
          };
        }

        /*
         * Repository persistence is allowed
         * only after deterministic Xroga
         * verification passes.
         *
         * Persistence itself is not required
         * yet because this tool is what creates
         * that persistence evidence.
         */
        const verification =
          evaluateSoftwareCompletion(
            {
              previewRequirement:
                contract.preview,

              evidence,

              requireSuccessfulChecks:
                true,

              requireRepositoryPersistence:
                false,
            },
          );

        if (
          !verification.complete
        ) {
          return {
            ok: false,

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
            ok: true,
            ...result,
          };
        } catch {
          return {
            ok: false,

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
        type: 'object',

        properties: {
          summary: {
            type: 'string',
          },
        },

        required: [
          'summary',
        ],

        additionalProperties:
          false,
      },

      lifecycle: {
        completesRun: true,
      },

      execute: async (
        rawInput,
      ) => {
        const input =
          rawInput as {
            summary: string;
          };

        const result =
          evaluateSoftwareCompletion(
            {
              previewRequirement:
                contract.preview,

              evidence,

              requireSuccessfulChecks:
                true,

              requireRepositoryPersistence:
                Boolean(
                  contract.repository,
                ),
            },
          );

        if (
          !result.complete
        ) {
          return {
            ok: false,

            completed: false,

            blockers:
              result.blockers,

            message:
              'The task is not verified yet.',
          };
        }

        await emit({
          type:
            'run.completed',

          status: 'success',

          title:
            'Software task completed',

          summary:
            input.summary,
        });

        return {
          ok: true,

          completed: true,

          summary:
            input.summary,

          evidence,
        };
      },
    });

  return {
    tools: [
      listFiles,
      readFiles,
      searchProject,
      writeFile,
      deleteFile,
      runCommand,
      runChecks,
      gitDiff,
      startPreview,
      verifyPreview,
      createReviewBranch,
    ],

    /*
     * Deliberately kept separate from
     * the production Agent until safe
     * completion continuation is wired.
     */
    completionTool:
      completeTask,
  };
}
