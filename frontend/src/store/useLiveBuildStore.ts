'use client';

import {
  create,
} from 'zustand';

import {
  createJSONStorage,
  persist,
} from 'zustand/middleware';

import type {
  SoftwareRunEvent,
  SwarmProgressEvent,
} from '@/lib/swarm';

export type RuntimePreviewKind =
  | 'browser'
  | 'api'
  | 'terminal'
  | 'logs'
  | 'extension'
  | 'mobile'
  | 'desktop'
  | 'mcp'
  | 'ai'
  | 'none';

export type RuntimePreviewStatus =
  | 'starting'
  | 'ready'
  | 'failed'
  | 'stopped'
  | 'not_applicable';

export interface RuntimePreviewState {
  projectId:
    string;

  runId:
    string;

  kind:
    RuntimePreviewKind;

  status:
    RuntimePreviewStatus;

  sessionId:
    string | null;

  processId:
    string | null;

  providerId:
    string | null;

  port:
    number | null;

  url:
    string | null;

  expiresAt:
    string | null;

  message:
    string;

  updatedAt:
    string;
}

export interface LiveBuildTimelineItem {
  id:
    string;

  runId:
    string;

  sequence:
    number;

  type:
    string;

  status:
    string;

  title:
    string;

  summary:
    string | null;

  at:
    string;
}

interface LiveBuildState {
  activeRunId:
    string | null;

  preview:
    RuntimePreviewState | null;

  timeline:
    LiveBuildTimelineItem[];

  ingestProgress:
    (
      event:
        SwarmProgressEvent,
    ) => void;

  ingestOutput:
    (
      output:
        unknown,
    ) => void;

  setPreview:
    (
      preview:
        RuntimePreviewState | null,
    ) => void;

  markStopped:
    () => void;

  clear:
    () => void;
}

function str(
  value:
    unknown,
): string | null {
  return (
    typeof value ===
      'string' &&
    value.trim()
      ? value.trim()
      : null
  );
}

function number(
  value:
    unknown,
): number | null {
  return (
    typeof value ===
      'number' &&
    Number.isFinite(
      value,
    )
      ? value
      : null
  );
}

function previewFromUnknown(
  value:
    unknown,
): RuntimePreviewState | null {
  if (
    !value ||
    typeof value !==
      'object' ||
    Array.isArray(
      value,
    )
  ) {
    return null;
  }

  const raw =
    value as
      Record<
        string,
        unknown
      >;

  const projectId =
    str(
      raw.projectId,
    );

  const runId =
    str(
      raw.runId,
    );

  const kind =
    str(
      raw.kind,
    );

  const status =
    str(
      raw.status,
    );

  if (
    !projectId ||
    !runId ||
    !kind ||
    !status
  ) {
    return null;
  }

  return {
    projectId,

    runId,

    kind:
      kind as RuntimePreviewKind,

    status:
      status as RuntimePreviewStatus,

    sessionId:
      str(
        raw.sessionId,
      ),

    processId:
      str(
        raw.processId,
      ),

    providerId:
      str(
        raw.providerId,
      ),

    port:
      number(
        raw.port,
      ),

    url:
      str(
        raw.url,
      ),

    expiresAt:
      str(
        raw.expiresAt,
      ),

    message:
      str(
        raw.message,
      ) ??
      '',

    updatedAt:
      str(
        raw.updatedAt,
      ) ??
      new Date()
        .toISOString(),
  };
}

function eventPreview(
  event:
    SoftwareRunEvent,
): RuntimePreviewState | null {
  const evidence =
    event.evidence;

  const projectId =
    evidence
      ?.projectId;

  if (
    !projectId
  ) {
    return null;
  }

  const kind =
    (
      evidence
        ?.previewKind ??
      'browser'
    ) as RuntimePreviewKind;

  const status:
    RuntimePreviewStatus =
    event.type ===
      'preview.ready'
      ? 'ready'
      : event.type ===
          'preview.failed'
        ? 'failed'
        : 'starting';

  return {
    projectId,

    runId:
      event.runId,

    kind,

    status,

    sessionId:
      evidence
        ?.runtimeSessionId ??
      null,

    processId:
      evidence
        ?.processId ??
      null,

    providerId:
      null,

    port:
      evidence
        ?.port ??
      null,

    url:
      evidence
        ?.previewUrl ??
      null,

    expiresAt:
      null,

    message:
      event.summary ??
      event.title,

    updatedAt:
      event.createdAt,
  };
}

export const useLiveBuildStore =
  create<LiveBuildState>()(
    persist(
      (
        set,
        get,
      ) => ({
        activeRunId:
          null,

        preview:
          null,

        timeline:
          [],

        ingestProgress:
          (
            progress,
          ) => {
            const software =
              progress
                .softwareEvent;

            if (
              !software
            ) {
              return;
            }

            const newRun =
              get()
                .activeRunId !==
              software.runId;

            const item:
              LiveBuildTimelineItem = {
              id:
                software.id,

              runId:
                software.runId,

              sequence:
                progress.sequence ??
                software.sequence,

              type:
                software.type,

              status:
                software.status,

              title:
                software.title,

              summary:
                software.summary ??
                null,

              at:
                software.createdAt,
            };

            let preview =
              get()
                .preview;

            if (
              software.type ===
                'preview.starting' ||
              software.type ===
                'preview.ready' ||
              software.type ===
                'preview.failed'
            ) {
              preview =
                eventPreview(
                  software,
                ) ??
                preview;
            }

            set({
              activeRunId:
                software.runId,

              timeline:
                [
                  ...(
                    newRun
                      ? []
                      : get()
                          .timeline
                  ),

                  item,
                ]
                  .filter(
                    (
                      entry,
                      index,
                      all,
                    ) =>
                      all.findIndex(
                        (
                          candidate,
                        ) =>
                          candidate.id ===
                          entry.id,
                      ) ===
                      index,
                  )
                  .slice(
                    -80,
                  ),

              preview,
            });
          },

        ingestOutput:
          (
            output,
          ) => {
            if (
              !output ||
              typeof output !==
                'object' ||
              Array.isArray(
                output,
              )
            ) {
              return;
            }

            const preview =
              previewFromUnknown(
                (
                  output as
                    Record<
                      string,
                      unknown
                    >
                )
                  .runtimePreview,
              );

            if (
              preview
            ) {
              set({
                preview,
              });
            }
          },

        setPreview:
          (
            preview,
          ) =>
            set({
              preview,
            }),

        markStopped:
          () => {
            const preview =
              get()
                .preview;

            if (
              !preview
            ) {
              return;
            }

            set({
              preview: {
                ...preview,

                status:
                  'stopped',

                url:
                  null,

                updatedAt:
                  new Date()
                    .toISOString(),
              },
            });
          },

        clear:
          () =>
            set({
              activeRunId:
                null,

              preview:
                null,

              timeline:
                [],
            }),
      }),

      {
        name:
          'xroga-live-build',

        version:
          1,

        storage:
          createJSONStorage(
            () =>
              localStorage,
          ),

        partialize:
          (
            state,
          ) => ({
            activeRunId:
              state.activeRunId,

            preview:
              state.preview,

            timeline:
              state.timeline,
          }),
      },
    ),
  );
