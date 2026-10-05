'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Brain, CheckCircle2, ChevronDown, CircleHelp, CirclePause, CircleX, Clock3, Code2, Database,
  FilePen, FileText, FlaskConical, Globe2, Link2, MonitorSmartphone, Plug, PlugZap, Rocket,
  Search, ShieldCheck, SquareTerminal, TriangleAlert, Workflow, type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  coalesceActivity,
  type XrogaActivityKind,
  type XrogaActivityPresentation,
} from '@/lib/terminal/activityPresentation';
import type { PendingExecutionIntent } from '@/lib/terminal/executionIntent';
import type { TerminalRunState } from '@/lib/terminal/terminalEvent';
import {
  ExecutionBranch,
  ExecutionPulse,
  ExecutionShimmerText,
  SearchGlobe,
} from './ExecutionMotion';

const DEFAULT_VISIBLE_ROWS = 4;

const ICONS: Record<XrogaActivityKind, LucideIcon> = {
  respond: CheckCircle2,
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

type TaskFamily = 'research' | 'document' | 'build' | 'app' | 'analysis' | 'general';

function familyForKind(kind: XrogaActivityKind): TaskFamily {
  if (['search', 'open-source', 'read-source', 'compare', 'summarize'].includes(kind)) return 'research';
  if (['read-file', 'upload', 'download'].includes(kind)) return 'document';
  if (['write-file', 'code', 'command', 'test', 'browser', 'deploy', 'verify'].includes(kind)) return 'build';
  if (['connected-app-read', 'connected-app-write', 'automation', 'database', 'approval', 'connection'].includes(kind)) return 'app';
  if (kind === 'understand') return 'analysis';
  return 'general';
}

function stateLabel(input: {
  active: boolean;
  latest: XrogaActivityPresentation;
  errors: number;
  stopped: boolean;
}): string {
  if (input.errors > 0) return 'Needs attention';
  if (input.stopped) return 'Stopped';
  if (input.latest.status === 'waiting') {
    if (input.latest.kind === 'approval') return 'Waiting for approval';
    if (input.latest.kind === 'connection') return 'Connection needed';
    return 'Waiting';
  }

  const family = familyForKind(input.latest.kind);
  if (!input.active) {
    if (family === 'research') return 'Research complete';
    if (family === 'document') return 'Document review complete';
    if (family === 'build') return 'Build work complete';
    if (family === 'app') return 'Action complete';
    if (family === 'analysis') return 'Analysis complete';
    return 'Complete';
  }

  if (family === 'research') return 'Researching';
  if (family === 'document') return 'Reading';
  if (family === 'build') return input.latest.kind === 'test' ? 'Testing' : input.latest.kind === 'deploy' ? 'Deploying' : input.latest.kind === 'verify' ? 'Verifying' : 'Building';
  if (family === 'app') {
    if (input.latest.kind === 'connected-app-read') return 'Reading app data';
    if (input.latest.kind === 'connected-app-write') return 'Updating app';
    if (input.latest.kind === 'database') return 'Querying data';
    return 'Running action';
  }
  if (family === 'analysis') return 'Working through it';
  return 'Working';
}

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

function PendingIntentGlyph({ intent }: { intent: PendingExecutionIntent }) {
  if (intent === 'research') return <SearchGlobe />;
  const Icon =
    intent === 'document'
      ? FileText
      : intent === 'code'
        ? Code2
        : intent === 'business'
          ? PlugZap
          : Brain;
  return <Icon className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />;
}

function ActivityRow({
  row,
  current,
  last,
}: {
  row: XrogaActivityPresentation;
  current: boolean;
  last: boolean;
}) {
  const [open, setOpen] = useState(false);
  const Icon = ICONS[row.kind];
  const receipts = [...(row.evidenceRefs ?? []), ...(row.artifactRefs ?? [])];
  const duration = durationLabel(row.durationMs);
  const expandable = Boolean(row.body || row.detail || receipts.length);
  const complete = row.status === 'complete';

  return (
    <li className="xv-exec-row" data-current={current ? 'true' : 'false'}>
      <ExecutionBranch active={current && row.status === 'active'} complete={complete} last={last} />

      <button
        type="button"
        disabled={!expandable}
        onClick={() => expandable && setOpen((value) => !value)}
        className={cn(
          'flex w-full min-w-0 items-start gap-2 py-1.5 text-left',
          expandable
            ? 'hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]/45'
            : 'cursor-default',
        )}
        aria-expanded={expandable ? open : undefined}
      >
        <span
          className={cn(
            'xv-exec-row-icon mt-0.5 grid h-5 w-5 shrink-0 place-items-center text-[var(--muted)]',
            current && 'text-[var(--accent)]',
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[12px] font-medium leading-5 text-[var(--foreground)]/88">
              {row.label}
            </span>
            {current && row.status === 'active' ? <ExecutionPulse className="scale-[0.72]" /> : null}
            {row.detail ? (
              <span className="hidden truncate text-[10px] text-[var(--muted)] sm:inline">
                {row.detail}
              </span>
            ) : null}
          </span>

          {(duration || receipts.length || row.status !== 'active') ? (
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
              {row.status === 'error' ? <span>failed</span> : null}
              {row.status === 'warning' ? <span>needs attention</span> : null}
            </span>
          ) : null}
        </span>

        <span className="mt-1 flex shrink-0 items-center gap-1 text-[var(--muted)]">
          {complete ? (
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          ) : row.status === 'error' ? (
            <CircleX className="h-3.5 w-3.5" aria-hidden />
          ) : row.status === 'warning' ? (
            <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
          ) : row.status === 'cancelled' || row.status === 'interrupted' ? (
            <CirclePause className="h-3.5 w-3.5" aria-hidden />
          ) : row.status === 'waiting' ? (
            <Clock3 className="h-3.5 w-3.5" aria-hidden />
          ) : null}
          {expandable ? (
            <ChevronDown
              className={cn('h-3 w-3 transition-transform', open && 'rotate-180')}
              aria-hidden
            />
          ) : null}
        </span>
      </button>

      {expandable && open ? (
        <div className="mb-2 ml-7 border-l border-[var(--card-border)]/45 pl-3">
          {row.body ? (
            <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words py-1.5 font-mono text-[10px] leading-4 text-[var(--foreground)]/78">
              {row.body}
            </pre>
          ) : null}
          {receipts.length ? (
            <div className="grid gap-1 py-1.5 text-[10px]">
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
  /** Transient request-lifecycle UI shown before the first observable event arrives. */
  pending?: boolean;
  /** Intent affects presentation only; it never becomes persisted execution evidence. */
  pendingIntent?: PendingExecutionIntent;
  pendingLabel?: string;
}

/**
 * Public execution trace derived only from observable events.
 * Transient pre-event feedback is deliberately cardless and is never persisted.
 */
export function TerminalLiveActivity({
  run,
  activity,
  pending = false,
  pendingIntent = 'chat',
  pendingLabel,
}: TerminalLiveActivityProps) {
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const rows = useMemo(
    () => (activity ? [...activity] : run ? coalesceActivity(run.events) : []),
    [activity, run],
  );
  const active = Boolean(run?.active || pending);

  useEffect(() => {
    if (!active || rows.length === 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active, rows.length]);

  if (rows.length === 0) {
    if (!pending) return null;

    const label = pendingLabel ?? 'Responding';
    const plainChat = pendingIntent === 'chat';

    return (
      <div
        className={cn('my-1.5 max-w-2xl', plainChat ? 'xv-exec-inline xv-exec-inline--chat' : 'xv-exec-inline')}
        aria-label="Response status"
        data-testid="terminal-live-activity"
        data-state="pending"
        data-intent={pendingIntent}
      >
        <span className="sr-only" role="status" aria-live="polite">
          {label}
        </span>
        {plainChat ? null : <PendingIntentGlyph intent={pendingIntent} />}
        <ExecutionShimmerText className="text-[12px] font-medium">{label}</ExecutionShimmerText>
        {plainChat ? null : <ExecutionPulse className="ml-0.5 scale-[0.72]" />}
      </div>
    );
  }

  const latest = rows.at(-1)!;
  const errors = rows.filter((row) => row.status === 'error').length;
  const complete = rows.filter((row) => row.status === 'complete').length;
  const firstAt = run?.startedAt ?? Math.min(...rows.map((row) => row.startedAt));
  const lastAt = active ? now : Math.max(...rows.map((row) => row.updatedAt));
  const elapsed = durationLabel(Math.max(0, lastAt - firstAt));
  const receipts = new Set(
    rows.flatMap((row) => [...(row.evidenceRefs ?? []), ...(row.artifactRefs ?? [])]),
  ).size;
  const stopped =
    run?.outcome === 'interrupted' ||
    rows.some((row) => row.status === 'cancelled' || row.status === 'interrupted');
  const state = stateLabel({ active, latest, errors, stopped });
  const visible = expanded ? rows : rows.slice(-DEFAULT_VISIBLE_ROWS);
  const family = familyForKind(latest.kind);

  return (
    <section
      className="my-1.5 max-w-2xl"
      aria-label="Execution activity"
      data-testid="terminal-live-activity"
      data-state={active ? 'active' : 'settled'}
      data-family={family}
    >
      <span className="sr-only" role="status" aria-live="polite">
        {latest.label}
      </span>

      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-2 py-1 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]/45"
        aria-expanded={expanded}
      >
        {active && family === 'research' ? (
          <SearchGlobe />
        ) : active ? (
          <ExecutionPulse />
        ) : errors > 0 ? (
          <CircleX className="h-4 w-4 shrink-0 text-[var(--muted)]" aria-hidden />
        ) : stopped ? (
          <CirclePause className="h-4 w-4 shrink-0 text-[var(--muted)]" aria-hidden />
        ) : (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--muted)]" aria-hidden />
        )}

        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            {active ? (
              <ExecutionShimmerText className="text-[12px] font-semibold">{state}</ExecutionShimmerText>
            ) : (
              <span className="text-[12px] font-semibold text-[var(--foreground)]">{state}</span>
            )}
            <span className="truncate text-[10px] text-[var(--muted)]">{latest.label}</span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] text-[var(--muted)]">
            <span>{rows.length} {rows.length === 1 ? 'action' : 'actions'}</span>
            {complete > 0 ? <span>{complete} complete</span> : null}
            {receipts > 0 ? <span>{receipts} {receipts === 1 ? 'receipt' : 'receipts'}</span> : null}
            {elapsed ? <span>{elapsed}</span> : null}
          </span>
        </span>

        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-[var(--muted)] transition-transform',
            expanded && 'rotate-180',
          )}
          aria-hidden
        />
      </button>

      <ol className="mt-1 space-y-0.5">
        {visible.map((row, index) => (
          <ActivityRow
            key={row.id}
            row={row}
            current={active && row.id === latest.id}
            last={index === visible.length - 1}
          />
        ))}
      </ol>

      {!expanded && rows.length > DEFAULT_VISIBLE_ROWS ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="ml-[30px] mt-1 text-[9px] text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          {rows.length - DEFAULT_VISIBLE_ROWS} earlier actions · show full trace
        </button>
      ) : null}

      {expanded ? (
        <div className="ml-[30px] mt-1 text-[9px] text-[var(--muted)]">
          Observable execution only · private model reasoning is never shown
        </div>
      ) : null}
    </section>
  );
}
