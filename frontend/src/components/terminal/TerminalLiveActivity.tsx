'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Brain, CheckCircle2, ChevronDown, CircleHelp, CirclePause, CircleX, Clock3, Code2, Database,
  FilePen, FileText, FlaskConical, Globe2, Link2, LoaderCircle, MessageCircle,
  MonitorSmartphone, Plug, PlugZap, Rocket, Search, ShieldCheck, SquareTerminal,
  TriangleAlert, Workflow, type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  coalesceActivity,
  type XrogaActivityKind,
  type XrogaActivityPresentation,
} from '@/lib/terminal/activityPresentation';
import type { TerminalRunState } from '@/lib/terminal/terminalEvent';

const DEFAULT_VISIBLE_ROWS = 3;

const ICONS: Record<XrogaActivityKind, LucideIcon> = {
  respond: MessageCircle,
  understand: Brain,
  search: Search,
  'open-source': Globe2,
  'read-source': Globe2,
  compare: Search,
  summarize: FileText,
  'read-file': FileText,
  'write-file': FilePen,
  code: Code2,
  command: SquareTerminal,
  test: FlaskConical,
  browser: MonitorSmartphone,
  database: Database,
  'connected-app-read': Plug,
  'connected-app-write': Plug,
  automation: Workflow,
  upload: FilePen,
  download: FileText,
  deploy: Rocket,
  verify: ShieldCheck,
  approval: CircleHelp,
  connection: PlugZap,
  waiting: Clock3,
  complete: CheckCircle2,
  warning: TriangleAlert,
  error: CircleX,
};

function durationLabel(ms?: number): string | null {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null;
  if (ms < 1000) return Math.max(1, Math.round(ms)) + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(ms < 10000 ? 1 : 0) + 's';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return minutes + 'm ' + seconds + 's';
}

function receiptLabel(value: string): string {
  if (/^https?:\/\//i.test(value)) {
    try {
      return new URL(value).hostname.replace(/^www\./, '');
    } catch {
      return value.slice(0, 72);
    }
  }
  if (/^[a-f0-9]{20,}$/i.test(value)) return value.slice(0, 8);
  return value.length > 72 ? value.slice(0, 69) + '…' : value;
}

function ActivityRow({ row, current }: { row: XrogaActivityPresentation; current: boolean }) {
  const [open, setOpen] = useState(false);
  const Icon = ICONS[row.kind];
  const receipts = [...(row.evidenceRefs ?? []), ...(row.artifactRefs ?? [])];
  const duration = durationLabel(row.durationMs);
  const expandable = Boolean(row.body || row.detail || receipts.length);

  return (
    <li
      className={cn(
        'rounded-xl border transition-colors',
        current
          ? 'border-[var(--accent)]/25 bg-[var(--accent)]/[0.045]'
          : 'border-transparent hover:border-[var(--card-border)]/55 hover:bg-[var(--foreground)]/[0.025]'
      )}
    >
      <button
        type="button"
        disabled={!expandable}
        onClick={() => expandable && setOpen((value) => !value)}
        className={cn(
          'flex w-full min-w-0 items-start gap-2.5 px-2.5 py-2 text-left',
          !expandable && 'cursor-default'
        )}
        aria-expanded={expandable ? open : undefined}
      >
        <span
          className={cn(
            'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg',
            current
              ? 'bg-[var(--accent)]/12 text-[var(--accent)]'
              : 'bg-[var(--foreground)]/[0.045] text-[var(--muted)]'
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className={cn(
                'truncate text-[12px] font-medium leading-5',
                !current && 'text-[var(--foreground)]/82'
              )}
            >
              {row.label}
            </span>
            {row.detail ? (
              <span className="hidden truncate text-[10px] text-[var(--muted)] sm:inline">
                {row.detail}
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[9px] text-[var(--muted)]">
            {duration ? <span>{duration}</span> : null}
            {receipts.length ? (
              <span className="inline-flex items-center gap-1">
                <Link2 className="h-2.5 w-2.5" aria-hidden />
                {receipts.length} {receipts.length === 1 ? 'receipt' : 'receipts'}
              </span>
            ) : null}
            {row.status === 'waiting' ? <span>waiting</span> : null}
            {row.status === 'cancelled' ? <span>cancelled</span> : null}
            {row.status === 'interrupted' ? <span>interrupted</span> : null}
          </span>
        </span>

        <span
          className={cn(
            'mt-1 flex shrink-0 items-center gap-1 text-[var(--muted)]',
            current && 'text-[var(--accent)]'
          )}
        >
          {current && row.status === 'active' ? (
            <LoaderCircle className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden />
          ) : row.status === 'complete' ? (
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          ) : row.status === 'error' ? (
            <CircleX className="h-3.5 w-3.5" aria-hidden />
          ) : row.status === 'warning' ? (
            <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
          ) : row.status === 'cancelled' || row.status === 'interrupted' ? (
            <CirclePause className="h-3.5 w-3.5" aria-hidden />
          ) : row.status === 'waiting' ? (
            <Clock3 className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 opacity-45" aria-hidden />
          )}
          {expandable ? (
            <ChevronDown
              className={cn('h-3 w-3 transition-transform', open && 'rotate-180')}
              aria-hidden
            />
          ) : null}
        </span>
      </button>

      {expandable && open ? (
        <div className="mx-2.5 mb-2.5 ml-11 overflow-hidden rounded-lg border border-[var(--card-border)]/55 bg-[var(--background)]/45">
          {row.body ? (
            <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words px-2.5 py-2 font-mono text-[10px] leading-4 text-[var(--foreground)]/78">
              {row.body}
            </pre>
          ) : null}
          {receipts.length ? (
            <div
              className={cn(
                'grid gap-1 px-2.5 py-2 text-[10px]',
                row.body && 'border-t border-[var(--card-border)]/45'
              )}
            >
              {receipts.map((receipt, index) => (
                <div key={receipt + index} className="flex min-w-0 items-start gap-2">
                  <span className="inline-flex w-14 shrink-0 items-center gap-1 text-[var(--muted)]">
                    <Link2 className="h-2.5 w-2.5" aria-hidden />
                    Proof
                  </span>
                  <span className="min-w-0 break-all text-[var(--foreground)]/78">
                    {receiptLabel(receipt)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

interface TerminalLiveActivityProps {
  run?: TerminalRunState;
  activity?: readonly XrogaActivityPresentation[];
}

/**
 * Public execution trace derived only from observable events.
 * This intentionally never exposes or fabricates private model chain-of-thought.
 */
export function TerminalLiveActivity({ run, activity }: TerminalLiveActivityProps) {
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const rows = useMemo(
    () => (activity ? [...activity] : coalesceActivity(run?.events ?? [])),
    [activity, run?.events]
  );
  const active = Boolean(run?.active);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  if (rows.length === 0) return null;

  const latest = rows.at(-1)!;
  const errors = rows.filter((row) => row.status === 'error').length;
  const complete = rows.filter((row) => row.status === 'complete').length;
  const firstAt = run?.startedAt ?? Math.min(...rows.map((row) => row.startedAt));
  const lastAt = active ? now : Math.max(...rows.map((row) => row.updatedAt));
  const elapsed = durationLabel(Math.max(0, lastAt - firstAt));
  const receipts = new Set(
    rows.flatMap((row) => [...(row.evidenceRefs ?? []), ...(row.artifactRefs ?? [])])
  ).size;

  const state = active
    ? latest.status === 'waiting'
      ? 'Waiting'
      : 'Working'
    : errors > 0 || run?.outcome === 'failure'
      ? 'Needs attention'
      : run?.outcome === 'interrupted' ||
          rows.some((row) => row.status === 'cancelled' || row.status === 'interrupted')
        ? 'Stopped'
        : 'Worked';

  const visible = expanded ? rows : rows.slice(-DEFAULT_VISIBLE_ROWS);
  const HeaderIcon = active
    ? LoaderCircle
    : errors > 0
      ? CircleX
      : state === 'Stopped'
        ? CirclePause
        : CheckCircle2;

  return (
    <section
      className="my-1.5 max-w-2xl overflow-hidden rounded-2xl border border-[var(--card-border)]/65 bg-[var(--card)]/45 shadow-sm"
      aria-label="Xroga activity"
      data-testid="terminal-live-activity"
    >
      <span className="sr-only" role="status" aria-live="polite">
        {latest.label}
      </span>

      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-[var(--foreground)]/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
        aria-expanded={expanded}
      >
        <span
          className={cn(
            'grid h-7 w-7 shrink-0 place-items-center rounded-lg',
            active
              ? 'bg-[var(--accent)]/12 text-[var(--accent)]'
              : 'bg-[var(--foreground)]/[0.055] text-[var(--foreground)]/72'
          )}
        >
          <HeaderIcon
            className={cn('h-4 w-4', active && 'motion-safe:animate-spin')}
            aria-hidden
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="text-[12px] font-semibold text-[var(--foreground)]">{state}</span>
            <span className="truncate text-[10px] text-[var(--muted)]">{latest.label}</span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] text-[var(--muted)]">
            <span>
              {rows.length} {rows.length === 1 ? 'action' : 'actions'}
            </span>
            {complete > 0 ? <span>{complete} complete</span> : null}
            {receipts > 0 ? (
              <span>
                {receipts} {receipts === 1 ? 'receipt' : 'receipts'}
              </span>
            ) : null}
            {elapsed ? (
              <span className="inline-flex items-center gap-1">
                <Clock3 className="h-2.5 w-2.5" aria-hidden />
                {elapsed}
              </span>
            ) : null}
          </span>
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-[var(--muted)] transition-transform',
            expanded && 'rotate-180'
          )}
          aria-hidden
        />
      </button>

      <ol className="space-y-0.5 border-t border-[var(--card-border)]/45 p-1.5">
        {visible.map((row) => (
          <ActivityRow key={row.id} row={row} current={active && row.id === latest.id} />
        ))}
      </ol>

      {!expanded && rows.length > DEFAULT_VISIBLE_ROWS ? (
        <div className="border-t border-[var(--card-border)]/35 px-3 py-1.5 text-[9px] text-[var(--muted)]">
          {rows.length - DEFAULT_VISIBLE_ROWS} earlier actions hidden · open Working for the full
          trace
        </div>
      ) : null}

      {expanded ? (
        <div className="border-t border-[var(--card-border)]/35 px-3 py-1.5 text-[9px] text-[var(--muted)]">
          Observable execution only · private model reasoning is never shown
        </div>
      ) : null}
    </section>
  );
}
