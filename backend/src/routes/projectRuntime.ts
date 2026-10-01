import {
  Router,
} from 'express';

import type {
  AuthRequest,
} from '../middleware/auth.js';

import {
  createProjectRuntimeManager,
  SupabaseProjectRuntimeStore,
} from '../synthesis/projectRuntime/index.js';

import {
  startOrRefreshLivePreview,
} from '../synthesis/livePreview/coordinator.js';

import {
  getLatestLivePreviewGrant,
  revokeLivePreviewGrants,
} from '../synthesis/livePreview/store.js';

import {
  livePreviewUrl,
} from '../synthesis/livePreview/signing.js';

import {
  planLivePreview,
} from '../synthesis/livePreview/plan.js';

import {
  LIVE_PREVIEW_SCHEMA_VERSION,
  type LivePreviewDescriptor,
} from '../synthesis/livePreview/types.js';

import {
  livePreviewStatusFromFacts,
} from '../synthesis/livePreview/status.js';

const router =
  Router();

function requireUser(
  req:
    AuthRequest,
): string {
  if (
    !req.userId
  ) {
    throw new Error(
      'Sign in required.',
    );
  }

  return req.userId;
}

router.get(
  '/:projectId/logs',

  async (
    req:
      AuthRequest,
    res,
  ) => {
    try {
      const userId =
        requireUser(
          req,
        );

      const projectId =
        String(
          req.params
            .projectId,
        );

      const store =
        new SupabaseProjectRuntimeStore();

      const revision =
        await store
          .loadLatestRevision(
            userId,
            projectId,
          );

      if (
        !revision
          ?.project
          .runtime
      ) {
        return res
          .status(
            404,
          )
          .json({
            error:
              'Project runtime not found.',
          });
      }

      const session =
        await store
          .loadSession(
            userId,
            revision
              .project
              .runtime
              .sessionId,
          );

      if (
        !session
      ) {
        return res
          .status(
            404,
          )
          .json({
            error:
              'Runtime session not found.',
          });
      }

      const reversedProcesses =
  [
    ...session.processes,
  ].reverse();

const process =
  reversedProcesses
    .find(
      (
        item,
      ) =>
        item.port ===
          3000 ||
        item.status ===
          'running',
    ) ??
  reversedProcesses[
    0
  ] ??
  null;

      if (
        !process
      ) {
        return res.json({
          logs:
            '',
        });
      }

      const logs =
        await createProjectRuntimeManager(
          userId,
        ).logs(
          session.sessionId,
          process.processId,
        );

      return res.json({
        logs,
      });
    } catch (
      error
    ) {
      return res
        .status(
          500,
        )
        .json({
          error:
            error instanceof
              Error
              ? error.message
              : String(
                  error,
                ),
        });
    }
  },
);

router.post(
  '/:projectId/restart',

  async (
    req:
      AuthRequest,
    res,
  ) => {
    try {
      const userId =
        requireUser(
          req,
        );

      const projectId =
        String(
          req.params
            .projectId,
        );

      const store =
        new SupabaseProjectRuntimeStore();

      const revision =
        await store
          .loadLatestRevision(
            userId,
            projectId,
          );

      if (
        !revision
      ) {
        return res
          .status(
            404,
          )
          .json({
            error:
              'Project not found.',
          });
      }

      const result =
        await startOrRefreshLivePreview({
          userId,

          project:
            revision.project,

          runId:
            revision.project
              .runId,

          forceRestart:
            true,
        });

      await store
        .saveRevision(
          userId,
          result.project,
        );

      return res.json({
        preview:
          result.preview,
      });
    } catch (
      error
    ) {
      return res
        .status(
          500,
        )
        .json({
          error:
            error instanceof
              Error
              ? error.message
              : String(
                  error,
                ),
        });
    }
  },
);

router.post(
  '/:projectId/stop',

  async (
    req:
      AuthRequest,
    res,
  ) => {
    try {
      const userId =
        requireUser(
          req,
        );

      const projectId =
        String(
          req.params
            .projectId,
        );

      const store =
        new SupabaseProjectRuntimeStore();

      const revision =
        await store
          .loadLatestRevision(
            userId,
            projectId,
          );

      if (
        !revision
          ?.project
          .runtime
      ) {
        return res.json({
          stopped:
            false,
        });
      }

      const runtime =
        createProjectRuntimeManager(
          userId,
        );

      await runtime
        .destroy(
          revision
            .project
            .runtime
            .sessionId,
        );

      await revokeLivePreviewGrants({
        userId,
        projectId,
      });

      const binding =
        await runtime
          .binding(
            revision
              .project
              .runtime
              .sessionId,
          );

      const project = {
        ...revision.project,

        runtime:
          binding,

        updatedAt:
          new Date()
            .toISOString(),
      };

      await store
        .saveRevision(
          userId,
          project,
        );

      return res.json({
        stopped:
          true,
      });
    } catch (
      error
    ) {
      return res
        .status(
          500,
        )
        .json({
          error:
            error instanceof
              Error
              ? error.message
              : String(
                  error,
                ),
        });
    }
  },
);

router.get(
  '/:projectId',

  async (
    req:
      AuthRequest,
    res,
  ) => {
    try {
      const userId =
        requireUser(
          req,
        );

      const projectId =
        String(
          req.params
            .projectId,
        );

      const store =
        new SupabaseProjectRuntimeStore();

      const revision =
        await store
          .loadLatestRevision(
            userId,
            projectId,
          );

      if (
        !revision
      ) {
        return res
          .status(
            404,
          )
          .json({
            error:
              'Project not found.',
          });
      }

      const plan =
        planLivePreview(
          revision.project,
        );

      const binding =
        revision
          .project
          .runtime;

      const runnable =
  Boolean(
    plan.process ||
    plan.command,
  );

      const runtime =
        createProjectRuntimeManager(
          userId,
        );

      let session =
        binding
          ? await store
              .loadSession(
                userId,
                binding.sessionId,
              )
          : null;

      let runtimeRunning =
        false;

      if (
        session &&
        session.runtimeClass ===
          'interactive' &&
        session.status ===
          'running'
      ) {
        try {
          session =
            await runtime
              .restore(
                session.sessionId,
              );

          runtimeRunning =
            true;
        } catch {
          runtimeRunning =
            false;

          await revokeLivePreviewGrants({
            userId,
            projectId,
            sessionId:
              session.sessionId,
          }).catch(
            () =>
              undefined,
          );
        }
      }

      let processId:
        string | null =
        null;

      if (
        runtimeRunning &&
        session &&
        plan.process
      ) {
        const process =
          [...session.processes]
            .reverse()
            .find(
              (
                item,
              ) =>
                item.status ===
                  'running' &&
                item.port ===
                  plan.process
                    ?.port,
            ) ??
          null;

        if (
          process
        ) {
          const probe =
            await runtime
              .exec(
                session.sessionId,
                {
                  command:
                    'kill',

                  args: [
                    '-0',
                    String(
                      process.pid,
                    ),
                  ],

                  networkPolicy:
                    'none',

                  timeoutMs:
                    5_000,
                },
              )
              .catch(
                () =>
                  null,
              );

          if (
            probe
              ?.exitCode ===
            0
          ) {
            processId =
              process.processId;
          }
        }
      }

      const grant =
  runtimeRunning &&
  session &&
  plan.process?.port !=
    null
    ? await getLatestLivePreviewGrant({
              userId,

              projectId,

              sessionId:
                session
                  .sessionId,
            })
          : null;

      if (
        runtimeRunning &&
        plan.process &&
        !processId
      ) {
        await revokeLivePreviewGrants({
          userId,
          projectId,
          sessionId:
            session
              ?.sessionId,
        }).catch(
          () =>
            undefined,
        );
      }

      const preview:
        LivePreviewDescriptor = {
        schemaVersion:
          LIVE_PREVIEW_SCHEMA_VERSION,

        projectId,

        runId:
          revision.project
            .runId,

        kind:
          plan.kind,

        status:
          livePreviewStatusFromFacts({
            runnable,

            runtimeRunning,

            processRequired:
              Boolean(
                plan.process,
              ),

            processRunning:
              Boolean(
                processId,
              ),

            publicGrantRequired:
              plan.process
                ?.port !=
              null,

            publicGrantAvailable:
              Boolean(
                grant,
              ),
          }),

        sessionId:
          session
            ?.sessionId ??
          null,

        processId,

        providerId:
          session
            ?.providerId ??
          null,

        port:
          grant
            ?.port ??
          null,

        url:
          grant
            ? livePreviewUrl(
                grant,
              )
            : null,

        expiresAt:
          grant
            ?.expiresAt ??
          null,

        message:
          plan.message,

        updatedAt:
          session
            ?.updatedAt ??
          revision.createdAt,
      };

      return res.json({
        preview,
      });
    } catch (
      error
    ) {
      return res
        .status(
          500,
        )
        .json({
          error:
            error instanceof
              Error
              ? error.message
              : String(
                  error,
                ),
        });
    }
  },
);

export default router;
