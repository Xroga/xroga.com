'use client';

import {
  useEffect,
  useRef,
  useState,
} from 'react';

import { cn } from '@/lib/utils';

import type {
  TerminalEvent,
  TerminalRunState,
} from '@/lib/terminal/terminalEvent';

import {
  formatElapsed,
  shouldShowWaitingLine,
  waitingLine,
} from '@/lib/terminal/liveActivityText';

import {
  ActivityIcon,
  type ActivityIconHandle,
} from '@/components/icons/animated/ActivityIcon';

/** Rows kept visible while a request is running. */
const VISIBLE_ROWS = 8;

const LEVEL_CLASS:
  Record<
    TerminalEvent['level'],
    string
  > = {
    info:
      'text-[var(--muted)]',

    warn:
      'text-amber-500',

    error:
      'text-red-500',

    success:
      'text-emerald-500',
  };

function seconds(
  fromMs: number,
  nowMs: number,
): number {
  return Math.max(
    0,
    Math.floor(
      (nowMs - fromMs) /
        1000,
    ),
  );
}

interface TerminalLiveActivityProps {
  run: TerminalRunState;

  /** Injected in tests; production reads the client clock. */
  now?: number;
}

/**
 * Shows real backend progress when available.
 *
 * Before the first backend event, the UI renders one compact neutral activity card.
 * It does not mention the build service because this component is shared by normal
 * chat, connected-app work, research and builds.
 */
export function TerminalLiveActivity({
  run,
  now,
}: TerminalLiveActivityProps) {
  const [
    tick,
    setTick,
  ] =
    useState<
      number |
      null
    >(
      null,
    );

  const activityRef =
    useRef<ActivityIconHandle>(
      null,
    );

  useEffect(
    () => {
      if (
        !run.active ||
        run.startedAt ==
          null
      ) {
        setTick(
          null,
        );

        return;
      }

      setTick(
        Date.now(),
      );

      const timer =
        window.setInterval(
          () =>
            setTick(
              Date.now(),
            ),
          1000,
        );

      return () =>
        window.clearInterval(
          timer,
        );
    },
    [
      run.active,
      run.startedAt,
    ],
  );

  const rows =
    run.events
      .filter(
        (event) =>
          event.kind !==
            'output' &&
          event.kind !==
            'result',
      )
      .slice(
        -VISIBLE_ROWS,
      );

  useEffect(
    () => {
      if (
        run.active &&
        rows.length === 0
      ) {
        activityRef
          .current
          ?.startAnimation();

        return () =>
          activityRef
            .current
            ?.stopAnimation();
      }

      activityRef
        .current
        ?.stopAnimation();
    },
    [
      run.active,
      rows.length,
    ],
  );

  if (
    !run.active
  ) {
    return null;
  }

  const clock =
    now ??
    tick;

  const elapsed =
    run.startedAt !=
      null &&
    clock !=
      null
      ? seconds(
          run.startedAt,
          clock,
        )
      : 0;

  if (
    rows.length ===
      0
  ) {
    if (
      !shouldShowWaitingLine(
        elapsed,
      )
    ) {
      return null;
    }

    return (
      <div
        className="my-2 flex w-full max-w-xl items-center gap-3 rounded-2xl border border-[var(--card-border)]/65 bg-[var(--foreground)]/[0.025] px-3.5 py-3 shadow-sm"
        role="status"
        aria-live="polite"
        data-testid="terminal-live-activity"
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--card-border)]/55 bg-[var(--accent)]/10 text-[var(--accent)]"
          aria-hidden="true"
        >
          <ActivityIcon
            ref={
              activityRef
            }
            size={
              19
            }
            duration={
              0.9
            }
          />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-semibold text-[var(--foreground)]">
            Xroga is on it
          </span>

          <span
            className="mt-0.5 block text-[11px] text-[var(--foreground)]/55"
            data-testid="terminal-waiting-line"
          >
            {waitingLine(
              elapsed,
            )}
          </span>
        </span>

        <span
          className="shrink-0 rounded-full border border-[var(--card-border)]/55 px-2 py-0.5 font-mono text-[10px] text-[var(--foreground)]/45"
          data-testid="terminal-elapsed"
        >
          {formatElapsed(
            elapsed,
          )}
        </span>
      </div>
    );
  }

  return (
    <div
      className="xv-term-live font-mono text-xs"
      role="status"
      aria-live="polite"
      data-testid="terminal-live-activity"
    >
      {rows.map(
        (
          event,
          index,
        ) => {
          const isLatest =
            index ===
            rows.length -
              1;

          return (
            <p
              key={
                event.seq
              }
              className={cn(
                'xv-term-liveline',
                !isLatest &&
                  'xv-term-liveline--past',
              )}
              data-testid={
                isLatest
                  ? 'ai-processing-status'
                  : undefined
              }
            >
              <span
                className={cn(
                  'xv-term-livedot',
                  isLatest &&
                    'xv-term-livedot--active',
                )}
                aria-hidden="true"
              />

              <span
                className={
                  LEVEL_CLASS[
                    event.level
                  ]
                }
              >
                {event.source
                  ? `${event.source}: `
                  : ''}
                {event.text}
              </span>

              {isLatest ? (
                <span
                  className="xv-term-liveclock"
                  data-testid="terminal-elapsed"
                >
                  {formatElapsed(
                    elapsed,
                  )}
                </span>
              ) : null}
            </p>
          );
        },
      )}
    </div>
  );
}
