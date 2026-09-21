'use client';

import {
  Loader2,
  ScrollText,
} from 'lucide-react';

import {
  useState,
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

export function RuntimeLogsButton() {
  const preview =
    useLiveBuildStore(
      (
        state,
      ) =>
        state.preview,
    );

  const appendTerminal =
    useProjectWorkspaceStore(
      (
        state,
      ) =>
        state.appendTerminal,
    );

  const setActiveTab =
    useProjectWorkspaceStore(
      (
        state,
      ) =>
        state.setActiveTab,
    );

  const [
    busy,
    setBusy,
  ] =
    useState(
      false,
    );

  if (
    !preview
      ?.sessionId
  ) {
    return null;
  }

  return (
    <button
      type="button"
      disabled={
        busy
      }
      onClick={
        async () => {
          setBusy(
            true,
          );

          try {
            const logs =
              await projectRuntimeApi
                .logs(
                  preview.projectId,
                );

            appendTerminal(
              `[runtime:${preview.kind}]`,
            );

            const lines =
              logs
                .split(
                  /\r?\n/,
                )
                .filter(
                  Boolean,
                )
                .slice(
                  -120,
                );

            if (
              lines.length ===
              0
            ) {
              appendTerminal(
                'No runtime logs are available yet.',
              );
            } else {
              for (
                const line of
                lines
              ) {
                appendTerminal(
                  line,
                );
              }
            }

            setActiveTab(
              'terminal',
            );
          } catch (
            error
          ) {
            appendTerminal(
              error instanceof
                Error
                ? `Runtime logs: ${error.message}`
                : 'Runtime logs could not be loaded.',
            );

            setActiveTab(
              'terminal',
            );
          } finally {
            setBusy(
              false,
            );
          }
        }
      }
      className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-semibold text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-50"
      title="Inspect runtime logs"
    >
      {busy ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <ScrollText className="h-3 w-3" />
      )}

      Logs
    </button>
  );
}
