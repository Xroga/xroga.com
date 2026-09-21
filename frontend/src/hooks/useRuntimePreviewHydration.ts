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

  const checkedProject =
    useRef<
      string | null
    >(
      null,
    );

  const projectId =
    preview
      ?.projectId ??
    null;

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
              cancelled
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
      setPreview,
    ],
  );
}
