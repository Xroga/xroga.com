'use client';

import {
  ExternalLink,
  Loader2,
  RefreshCw,
  Square,
} from 'lucide-react';

import {
  useState,
} from 'react';

import {
  projectRuntimeApi,
} from '@/lib/projectRuntimeApi';

import {
  RuntimeLogsButton,
} from './RuntimeLogsButton';

import {
  useLiveBuildStore,
} from '@/store/useLiveBuildStore';

export function RuntimePreviewControls({
  onReload,
}: {
  onReload:
    () => void;
}) {
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

  const markStopped =
    useLiveBuildStore(
      (
        state,
      ) =>
        state.markStopped,
    );

  const [
    busy,
    setBusy,
  ] =
    useState<
      'restart'
      | 'stop'
      | null
    >(
      null,
    );

  if (
    !preview
  ) {
    return (
      <button
        type="button"
        onClick={
          onReload
        }
        className="p-1 rounded text-[var(--muted)] hover:text-[var(--foreground)]"
        title="Reload preview"
        aria-label="Reload preview"
      >
        <RefreshCw className="h-3 w-3" />
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={
          onReload
        }
        className="p-1 rounded text-[var(--muted)] hover:text-[var(--foreground)]"
        title="Reload preview"
        aria-label="Reload preview"
      >
        <RefreshCw className="h-3 w-3" />
      </button>

      <button
        type="button"
        disabled={
          busy !==
          null
        }
        onClick={
          async () => {
            setBusy(
              'restart',
            );

            try {
              const next =
                await projectRuntimeApi
                  .restart(
                    preview.projectId,
                  );

              if (
                next
              ) {
                setPreview(
                  next,
                );
              }

              onReload();
            } finally {
              setBusy(
                null,
              );
            }
          }
        }
        className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-semibold text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-50"
        title="Restart Preview runtime"
      >
        {busy ===
        'restart' ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <RefreshCw className="h-3 w-3" />
        )}

        Restart
      </button>

      {preview.sessionId &&
      preview.status !==
        'stopped' ? (
        <button
          type="button"
          disabled={
            busy !==
            null
          }
          onClick={
            async () => {
              setBusy(
                'stop',
              );

              try {
                await projectRuntimeApi
                  .stop(
                    preview.projectId,
                  );

                markStopped();
              } finally {
                setBusy(
                  null,
                );
              }
            }
          }
          className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-semibold text-[var(--muted)] hover:text-rose-500 disabled:opacity-50"
          title="Stop Preview runtime"
        >
          {busy ===
          'stop' ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Square className="h-3 w-3" />
          )}

          Stop
        </button>
      ) : null}

      <RuntimeLogsButton />
      {preview.url ? (
        <a
          href={
            preview.url
          }
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-semibold text-[var(--accent)]"
        >
          <ExternalLink className="h-3 w-3" />

          Open
        </a>
      ) : null}
    </>
  );
}
