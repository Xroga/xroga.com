'use client';

import {
  useEffect,
  useRef,
} from 'react';

import {
  projectRuntimeApi,
} from '@/lib/projectRuntimeApi';

import {
  useLiveBuildStore,
} from '@/store/useLiveBuildStore';

import {
  useProjectWorkspaceStore,
} from '@/store/useProjectWorkspaceStore';

export function runtimePreviewHydrationTarget(
  workspaceProjectId:
    string | null,

  activeProjectContextKey:
    string | null,

  persistedPreviewProjectId:
    string | null,
): string | null {
  if (
    workspaceProjectId
      ?.trim()
  ) {
    return workspaceProjectId
      .trim();
  }

  /*
   * A selected canonical project context without a project id is still
   * restoring. Never let an older local Preview cross that boundary.
   */
  if (
    activeProjectContextKey
  ) {
    return null;
  }

  return (
    persistedPreviewProjectId
      ?.trim() ||
    null
  );
}

export function useRuntimePreviewHydration():
  void {
  const preview =
    useLiveBuildStore(
      (
        state,
      ) =>
        state.preview,
    );

  const setPreview =
    useLiveBuildStore(
      (
        state,
      ) =>
        state.setPreview,
    );

  const workspaceProjectId =
    useProjectWorkspaceStore(
      (
        state,
      ) =>
        state.projectId,
    );

  const activeProjectContextKey =
    useProjectWorkspaceStore(
      (
        state,
      ) =>
        state.activeProjectContextKey,
    );

  const checkedProject =
    useRef<
      string | null
    >(
      null,
    );

  const projectId =
    runtimePreviewHydrationTarget(
      workspaceProjectId,
      activeProjectContextKey,
      preview
        ?.projectId ??
        null,
    );

  useEffect(
    () => {
      if (
        !projectId ||
        checkedProject
          .current ===
          projectId
      ) {
        return;
      }

      checkedProject.current =
        projectId;

      if (
        preview &&
        preview.projectId !==
          projectId
      ) {
        setPreview(
          null,
        );
      }

      let cancelled =
        false;

      void projectRuntimeApi
        .status(
          projectId,
        )
        .then(
          (
            next,
          ) => {
            if (
              cancelled ||
              runtimePreviewHydrationTarget(
                useProjectWorkspaceStore
                  .getState()
                  .projectId,

                useProjectWorkspaceStore
                  .getState()
                  .activeProjectContextKey,

                useLiveBuildStore
                  .getState()
                  .preview
                  ?.projectId ??
                  null,
              ) !==
                projectId
            ) {
              return;
            }

            setPreview(
              next,
            );
          },
        )
        .catch(
          () => {
            if (
              cancelled
            ) {
              return;
            }

            const current =
              useLiveBuildStore
                .getState()
                .preview;

            if (
              !current ||
              current
                .projectId !==
                projectId
            ) {
              return;
            }

            setPreview({
              ...current,

              status:
                'stopped',

              url:
                null,

              message:
                'The previous Preview runtime is no longer available.',

              updatedAt:
                new Date()
                  .toISOString(),
            });
          },
        );

      return () => {
        cancelled =
          true;
      };
    },

    [
      projectId,
      preview,
      setPreview,
    ],
  );
}
