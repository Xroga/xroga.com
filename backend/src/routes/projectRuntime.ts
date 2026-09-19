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

      const process =
        [...session.processes]
          .reverse()
          .find(
            (
              item,
            ) =>
              item.port ===
                3000 ||
              item.status ===
                'running',
          );

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

      let processId:
        string | null =
        null;

      if (
        binding
      ) {
        const session =
          await store
            .loadSession(
              userId,
              binding
                .sessionId,
            );

        processId =
          [...(
            session
              ?.processes ??
            []
          )]
            .reverse()
            .find(
              (
                process,
              ) =>
                process.status ===
                  'running' &&
                (
                  process.port ===
                    3000 ||
                  process.port ==
                    null
                ),
            )
            ?.processId ??
          null;
      }

      const grant =
        binding
          ? await getLatestLivePreviewGrant({
              userId,

              projectId,

              sessionId:
                binding
                  .sessionId,
            })
          : null;

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
          binding
            ? (
                binding.status ===
                  'running'
                  ? 'ready'
                  : 'stopped'
              )
            : (
                plan.kind ===
                  'none'
                  ? 'not_applicable'
                  : 'stopped'
              ),

        sessionId:
          binding
            ?.sessionId ??
          null,

        processId,

        providerId:
          binding
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
          binding
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
