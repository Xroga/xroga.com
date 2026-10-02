'use client';

import { useEffect, useState } from 'react';
import { Check, CircleX, Clock3, FileText, Globe2, LoaderCircle, Rocket, Search, SquareTerminal } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { TerminalEvent, TerminalRunState } from '@/lib/terminal/terminalEvent';
import { formatElapsed, shouldShowWaitingLine, waitingLine } from '@/lib/terminal/liveActivityText';

const VISIBLE_ROWS = 10;

const LEVEL_CLASS: Record<TerminalEvent['level'], string> = {
  info: 'text-[var(--muted)]',
  warn: 'text-amber-500',
  error: 'text-red-500',
  success: 'text-emerald-500',
};

function seconds(fromMs: number, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - fromMs) / 1000));
}

function EventIcon({ event, active }: { event: TerminalEvent; active: boolean }) {
  const type = event.canonical?.type ?? '';
  const props = { className: cn('h-4 w-4 shrink-0', active && event.level === 'info' && 'motion-safe:animate-spin'), 'aria-hidden': true as const };
  if (event.level === 'error' || type.endsWith('.failed')) return <CircleX {...props} />;
  if (event.level === 'success' || type.endsWith('.completed')) return <Check {...props} />;
  if (type.includes('file') || event.text.toLowerCase().includes('file')) return <FileText {...props} />;
  if (type.includes('tool') || event.text.toLowerCase().match(/command|test|build/)) return <SquareTerminal {...props} />;
  if (type.includes('artifact') || event.text.toLowerCase().includes('preview')) return <Globe2 {...props} />;
  if (type === 'receipt.created' || event.text.toLowerCase().includes('deploy')) return <Rocket {...props} />;
  if (type.endsWith('.waiting')) return <Clock3 {...props} />;
  if (event.text.toLowerCase().includes('search')) return <Search {...props} />;
  return <LoaderCircle {...props} />;
}

function TechnicalEvidence({ event }: { event: TerminalEvent }) {
  const canonical = event.canonical;
  const metadata = canonical?.metadata ?? {};
  const rows = [
    canonical?.toolCallId ? ['Command ID', canonical.toolCallId] : null,
    typeof metadata.durationMs === 'number' ? ['Duration', formatElapsed(Math.floor(metadata.durationMs / 1000))] : null,
    typeof metadata.exitCode === 'number' ? ['Exit code', String(metadata.exitCode)] : null,
    typeof metadata.filePath === 'string' ? ['File', metadata.filePath] : null,
    typeof metadata.runtimeSessionId === 'string' ? ['Runtime', metadata.runtimeSessionId] : null,
    canonical?.evidenceRefs?.length ? ['Evidence', canonical.evidenceRefs.join(', ')] : null,
  ].filter((row): row is string[] => Boolean(row));

  if (!event.body && rows.length === 0) return null;
  return (
    <details className="mb-2 ml-6 mt-1 max-w-[760px] text-[11px] text-[var(--muted)]">
      <summary className="cursor-pointer select-none rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">Developer details</summary>
      <div className="mt-1 rounded-lg border border-[var(--card-border)]/50 bg-[var(--foreground)]/[0.035] p-2.5">
        {rows.map(([label, value]) => <p key={label}><span className="font-medium text-[var(--foreground)]/75">{label}</span> · {value}</p>)}
        {event.body ? <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-4" data-testid="terminal-event-body">{event.body}</pre> : null}
      </div>
    </details>
  );
}

function importantAnnouncement(event: TerminalEvent | undefined): string | null {
  const type = event?.canonical?.type;
  if (!event || !type) return null;
  if (type === 'run.started') return 'Task started';
  if (type === 'connection.required' || type === 'approval.requested') return 'Approval required';
  if (type === 'run.completed') return 'Task completed';
  if (type === 'run.failed') return 'Task failed';
  return null;
}

interface TerminalLiveActivityProps {
  run: TerminalRunState;
  /** Injected in tests; production reads the client clock. */
  now?: number;
}

/** Structured activity derived only from received run events. */
export function TerminalLiveActivity({ run, now }: TerminalLiveActivityProps) {
  const [tick, setTick] = useState<number | null>(null);

  useEffect(() => {
    if (!run.active || run.startedAt == null) {
      setTick(null);
      return;
    }
    setTick(Date.now());
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [run.active, run.startedAt]);

  const rows = run.events
    .filter((event) => event.kind !== 'output' && event.kind !== 'result')
    .slice(-VISIBLE_ROWS);

  if (!run.active) return null;

  const clock = now ?? tick;
  const elapsed = run.startedAt != null && clock != null ? seconds(run.startedAt, clock) : 0;

  if (rows.length === 0) {
    if (!shouldShowWaitingLine(elapsed)) return null;
    return (
      <div className="my-2 flex w-full max-w-xl items-center gap-3 rounded-2xl border border-[var(--card-border)]/65 bg-[var(--foreground)]/[0.025] px-3.5 py-3 shadow-sm" role="status" aria-live="polite" data-testid="terminal-live-activity">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--card-border)]/55 bg-[var(--accent)]/10 text-[var(--accent)]" aria-hidden="true">
          <LoaderCircle className="h-[18px] w-[18px] motion-safe:animate-spin" />
        </span>
        <span className="min-w-0 flex-1"><span className="block text-[12px] font-semibold text-[var(--foreground)]">Xroga is on it</span><span className="mt-0.5 block text-[11px] text-[var(--foreground)]/55" data-testid="terminal-waiting-line">{waitingLine(elapsed)}</span></span>
        <span className="shrink-0 rounded-full border border-[var(--card-border)]/55 px-2 py-0.5 font-mono text-[10px] text-[var(--foreground)]/45" data-testid="terminal-elapsed">{formatElapsed(elapsed)}</span>
      </div>
    );
  }

  const announcement = importantAnnouncement(rows.at(-1));

  return (
    <div className="xv-term-live text-xs" data-testid="terminal-live-activity">
      <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
      {rows.map((event, index) => {
        const isLatest = index === rows.length - 1;
        return (
          <div key={event.canonical?.eventId ?? event.seq} className="min-w-0">
            <p className={cn('xv-term-liveline gap-2', !isLatest && 'xv-term-liveline--past')} data-testid={isLatest ? 'ai-processing-status' : undefined}>
              <EventIcon event={event} active={isLatest && run.active} />
              <span className={cn('min-w-0 break-words', LEVEL_CLASS[event.level])}>{event.source ? `${event.source}: ` : ''}{event.text}</span>
              {isLatest ? <span className="xv-term-liveclock" data-testid="terminal-elapsed">{formatElapsed(elapsed)}</span> : null}
            </p>
            <TechnicalEvidence event={event} />
          </div>
        );
      })}
    </div>
  );
}
