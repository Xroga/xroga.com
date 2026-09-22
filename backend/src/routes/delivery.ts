import {
  Router,
} from 'express';

import type {
  AuthRequest,
} from '../middleware/auth.js';

import {
  SupabaseProjectRuntimeStore,
} from '../synthesis/projectRuntime/index.js';

import {
  buildProjectArchive,
  deliveryStateForProject,
} from '../synthesis/delivery/projectDelivery.js';

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

function projectIdFrom(
  req:
    AuthRequest,
): string {
  const projectId =
    String(
      req.params
        .projectId ??
      '',
    )
      .trim();

  if (
    !projectId
  ) {
    throw new Error(
      'Project id is required.',
    );
  }

  return projectId;
}

async function latestProject(
  userId:
    string,

  projectId:
    string,
) {
  const store =
    new SupabaseProjectRuntimeStore();

  return store
    .loadLatestRevision(
      userId,
      projectId,
    );
}

/**
 * Download the COMPLETE latest project workspace.
 *
 * GitHub and Vercel are intentionally not prerequisites.
 */
router.get(
  '/:projectId/download.zip',

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
        projectIdFrom(
          req,
        );

      const revision =
        await latestProject(
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

      const archive =
        buildProjectArchive(
          revision.project,
        );

      res.setHeader(
        'Content-Type',
        archive.contentType,
      );

      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${archive.filename}"`,
      );

      res.setHeader(
        'Content-Length',
        String(
          archive.buffer
            .length,
        ),
      );

      res.setHeader(
        'Cache-Control',
        'private, no-store',
      );

      res.setHeader(
        'X-Content-Type-Options',
        'nosniff',
      );

      res.setHeader(
        'X-Xroga-Project-Verified',
        revision.project
          .verification
          .verified
          ? 'true'
          : 'false',
      );

      return res.send(
        archive.buffer,
      );
    } catch (
      error
    ) {
      const message =
        error instanceof
          Error
          ? error.message
          : String(
              error,
            );

      if (
        message ===
        'PROJECT_ARCHIVE_EMPTY'
      ) {
        return res
          .status(
            409,
          )
          .json({
            error:
              'The project does not contain downloadable files yet.',
          });
      }

      if (
        message ===
        'PROJECT_ARCHIVE_TOO_LARGE'
      ) {
        return res
          .status(
            413,
          )
          .json({
            error:
              'The project archive is too large to download through this endpoint.',
          });
      }

      return res
        .status(
          500,
        )
        .json({
          error:
            message,
        });
    }
  },
);

/**
 * Canonical user-facing delivery truth.
 *
 * A GitHub or deployment failure does not erase a saved Xroga project.
 */
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
        projectIdFrom(
          req,
        );

      const revision =
        await latestProject(
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

      return res.json({
        delivery:
          deliveryStateForProject(
            revision.project,
          ),

        revision: {
          revisionId:
            revision
              .revisionId,

          revisionNumber:
            revision
              .revisionNumber,

          createdAt:
            revision
              .createdAt,
        },
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
