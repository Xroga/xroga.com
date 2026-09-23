import {
  Router,
} from 'express';

import {
  z,
} from 'zod';

import type {
  AuthRequest,
} from '../middleware/auth.js';

import {
  SupabaseProjectRuntimeStore,
} from '../synthesis/projectRuntime/index.js';

import {
  buildProjectArchive,
} from '../synthesis/delivery/projectDelivery.js';

import {
  deployProjectDelivery,
  loadProjectDelivery,
  ProjectDeliveryActionError,
  publishProjectDelivery,
} from '../synthesis/delivery/projectDeliveryService.js';

const router =
  Router();

function requireUser(
  req:
    AuthRequest,
): string {
  if (
    !req.userId
  ) {
    throw new ProjectDeliveryActionError(
      'AUTH_REQUIRED',

      'Sign in required.',

      401,
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
    throw new ProjectDeliveryActionError(
      'PROJECT_ID_REQUIRED',

      'Project id is required.',

      400,
    );
  }

  return projectId;
}

function respondError(
  res:
    Parameters<
      Parameters<
        typeof router.get
      >[1]
    >[1],

  error:
    unknown,
) {
  if (
    error instanceof
    ProjectDeliveryActionError
  ) {
    return res
      .status(
        error.statusCode,
      )
      .json({
        error:
          error.message,

        code:
          error.code,
      });
  }

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

      code:
        'DELIVERY_FAILED',
    });
}

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
        throw new ProjectDeliveryActionError(
          'PROJECT_NOT_FOUND',

          'Project not found.',

          404,
        );
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

            code:
              'PROJECT_ARCHIVE_EMPTY',
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

            code:
              'PROJECT_ARCHIVE_TOO_LARGE',
          });
      }

      return respondError(
        res,
        error,
      );
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
      const delivery =
        await loadProjectDelivery(
          requireUser(
            req,
          ),

          projectIdFrom(
            req,
          ),
        );

      return res.json(
        delivery,
      );
    } catch (
      error
    ) {
      return respondError(
        res,
        error,
      );
    }
  },
);

router.post(
  '/:projectId/publish',

  async (
    req:
      AuthRequest,

    res,
  ) => {
    const parsed =
      z.object({
        repository:
          z
            .string()
            .trim()
            .min(
              3,
            )
            .optional(),

        branch:
          z
            .string()
            .trim()
            .min(
              1,
            )
            .max(
              100,
            )
            .optional(),

        directWriteAuthorized:
          z
            .boolean()
            .optional(),

        visibility:
          z
            .enum([
              'private',
              'public',
            ])
            .optional(),
      })
        .safeParse(
          req.body ??
          {},
        );

    if (
      !parsed.success
    ) {
      return res
        .status(
          400,
        )
        .json({
          error:
            'Invalid publication request.',

          code:
            'INVALID_PUBLICATION_REQUEST',
        });
    }

    try {
      const delivery =
        await publishProjectDelivery(
          requireUser(
            req,
          ),

          projectIdFrom(
            req,
          ),

          parsed.data,
        );

      return res.json(
        delivery,
      );
    } catch (
      error
    ) {
      return respondError(
        res,
        error,
      );
    }
  },
);

router.post(
  '/:projectId/deploy',

  async (
    req:
      AuthRequest,

    res,
  ) => {
    try {
      const delivery =
        await deployProjectDelivery(
          requireUser(
            req,
          ),

          projectIdFrom(
            req,
          ),
        );

      return res.json(
        delivery,
      );
    } catch (
      error
    ) {
      return respondError(
        res,
        error,
      );
    }
  },
);

export default router;
