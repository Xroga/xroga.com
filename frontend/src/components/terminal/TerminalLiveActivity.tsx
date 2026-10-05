'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Brain,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  CirclePause,
  CircleX,
  Clock3,
  Code2,
  Database,
  FilePen,
  FileText,
  FlaskConical,
  Globe2,
  Link2,
  MonitorSmartphone,
  Plug,
  PlugZap,
  Rocket,
  Search,
  ShieldCheck,
  SquareTerminal,
  TriangleAlert,
  Workflow,
  type LucideIcon,
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
  SearchScanner,
  StalledDots,
  UniversalExecutionOrb,
} from './ExecutionMotion';

const DEFAULT_VISIBLE_ROWS = 5;
const STALLED_AFTER_MS = 9_000;

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

function familyForIntent(intent: PendingExecutionIntent): TaskFamily {
  if (intent === 'research') return 'research';
  if (intent === 'document') return 'document';
  if (intent === 'code') return 'build';
  if (intent === 'business') return 'app';
  if (intent === 'analysis') return 'analysis';
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
  if (family === 'build') {
    if (input.latest.kind === 'test') return 'Testing';
    if (input.latest.kind === 'deploy') return 'Deploying';
    if (input.latest.kind === 'verify') return 'Verifying';
    return 'Building';
  }
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

function requestPreview(value?: string): string | null {
  const clean = value?.replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  return clean.length > 260 ? clean.slice(0, 257) + '…' : clean;
}

function capabilitiesForIntent(intent: PendingExecutionIntent): string[] {
  if (intent === 'research') return ['Web search', 'Open sources', 'Read sources', 'Compare evidence'];
  if (intent === 'document') return ['Read document', 'Extract evidence', 'Compare sections', 'Summarize'];
  if (intent === 'code') return ['Inspect files', 'Edit code', 'Run commands', 'Test', 'Verify'];
  if (intent === 'business') return ['Read connected app', 'Prepare action', 'Request approval', 'Record receipt'];
  if (intent === 'analysis') return ['Work the problem', 'Check constraints', 'Verify result'];
  return [];
}

function evidenceSummary(rows: readonly XrogaActivityPresentation[]): string[] {
  const count = (kinds: XrogaActivityKind[]) => rows.filter((row) => kinds.includes(row.kind)).length;
  const searches = count(['search']);
  const sources = count(['open-source', 'read-source', 'compare']);
  const files = count(['read-file', 'write-file', 'upload', 'download']);
  const checks = count(['command', 'test', 'browser', 'verify', 'deploy']);
  const appActions = count(['connected-app-read', 'connected-app-write', 'automation', 'database', 'approval']);
  const completed = rows.filter((row) => row.status === 'complete').length;
  const receipts = new Set(rows.flatMap((row) => [...(row.evidenceRefs ?? []), ...(row.artifactRefs ?? [])])).size;

  const output: string[] = [];
  if (searches) output.push(`${searches} ${searches === 1 ? 'search' : 'searches'}`);
  if (sources) output.push(`${sources} source ${sources === 1 ? 'action' : 'actions'}`);
  if (files) output.push(`${files} file ${files === 1 ? 'action' : 'actions'}`);
  if (checks) output.push(`${checks} ${checks === 1 ? 'check' : 'checks'}`);
  if (appActions) output.push(`${appActions} app ${appActions === 1 ? 'action' : 'actions'}`);
  if (completed) output.push(`${completed} complete`);
  if (receipts) output.push(`${receipts} ${receipts === 1 ? 'receipt' : 'receipts'}`);
  return output;
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
  const visibleDetail =
    row.detail ||
    (['search', 'open-source', 'read-source'].includes(row.kind) ? row.body?.split('\n')[0] : undefined);

  return (
    <li className="xv-exec-row" data-current={current ? 'true' : 'false'}>
      <ExecutionBranch active={current && row.status === 'active'} complete={complete} last={last} />

      <button
        type="button"
        disabled={!expandable}
        onClick={() => expandable && setOpen((value) => !value)}
        className={cn(
          'flex w-full min-w-0 items-start text-left',
          expandable
            ? 'hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]/45'
            : 'cursor-default',
        )}
        aria-expanded={expandable ? open : undefined}
      >
        <span
          className={cn(
            'xv-exec-row-icon mt-0.5 grid shrink-0 place-items-center text-[var(--muted)]',
            current && 'text-[var(--accent)]',
          )}
        >
          <Icon aria-hidden />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="xv-exec-row-label min-w-0 truncate font-medium text-[var(--foreground)]/90">
              {row.label}
            </span>
            {current && row.status === 'active' ? <ExecutionPulse className="scale-[0.84]" /> : null}
          </span>

          {visibleDetail ? (
            <span className="xv-exec-row-detail">{visibleDetail}</span>
          ) : null}

          {(duration || receipts.length || row.status !== 'active') ? (
            <span className="xv-exec-row-meta mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[var(--muted)]">
              {duration ? <span>{duration}</span> : null}
              {receipts.length ? (
                <span className="inline-flex items-center gap-1">
                  <Link2 className="h-3 w-3" aria-hidden />
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
            <CheckCircle2 className="h-4 w-4" aria-hidden />
          ) : row.status === 'error' ? (
            <CircleX className="h-4 w-4" aria-hidden />
          ) : row.status === 'warning' ? (
            <TriangleAlert className="h-4 w-4" aria-hidden />
          ) : row.status === 'cancelled' || row.status === 'interrupted' ? (
            <CirclePause className="h-4 w-4" aria-hidden />
          ) : row.status === 'waiting' ? (
            <Clock3 className="h-4 w-4" aria-hidden />
          ) : null}
          {expandable ? (
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
              aria-hidden
            />
          ) : null}
        </span>
      </button>

      {expandable && open ? (
        <div className="mb-3 ml-8 border-l border-[var(--card-border)]/45 pl-4">
          {row.body ? (
            <pre className="xv-exec-row-body max-h-64 overflow-auto whitespace-pre-wrap break-words py-2 font-mono text-[var(--foreground)]/80">
              {row.body}
            </pre>
          ) : null}
          {receipts.length ? (
            <div className="grid gap-1.5 py-2">
              {receipts.map((receipt, index) => (
                <div key={receipt + index} className="xv-exec-receipt flex min-w-0 items-start gap-2">
                  <span className="inline-flex w-20 shrink-0 items-center gap-1 text-[var(--muted)]">
                    <Link2 className="h-3 w-3" aria-hidden />
                    Proof
                  </span>
                  <span className="min-w-0 break-all text-[var(--foreground)]/80">
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
  pending?: boolean;
  pendingIntent?: PendingExecutionIntent;
  pendingLabel?: string;
  requestText?: string;
}

export function TerminalLiveActivity({
  run,
  activity,
  pending = false,
  pendingIntent = 'chat',
  pendingLabel,
  requestText,
}: TerminalLiveActivityProps) {
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [mountedAt] = useState(() => Date.now());

  const rows = useMemo(
    () => (activity ? [...activity] : run ? coalesceActivity(run.events) : []),
    [activity, run],
  );
  const active = Boolean(run?.active || pending);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  const request = requestPreview(requestText);
  const lastObservableAt =
    rows.length > 0
      ? Math.max(...rows.map((row) => row.updatedAt))
      : run?.startedAt ?? mountedAt;
  const silentForMs = Math.max(0, now - lastObservableAt);
  const stalled = active && silentForMs >= STALLED_AFTER_MS;

  if (rows.length === 0) {
    if (!pending) return null;

    const label = pendingLabel ?? 'Responding';
    const family = familyForIntent(pendingIntent);
    const capabilities = capabilitiesForIntent(pendingIntent);
    const plainChat = pendingIntent === 'chat';

    if (plainChat && !request) {
      return (
        <div className="xv-exec-inline xv-exec-inline--chat my-2" data-state="pending">
          <ExecutionShimmerText>{label}</ExecutionShimmerText>
        </div>
      );
    }

    return (
      <section
        className="xv-exec-trace"
        aria-label="Response status"
        data-testid="terminal-live-activity"
        data-state="pending"
        data-intent={pendingIntent}
      >
        {request ? (
          <div className="xv-exec-request">
            <div className="xv-exec-request__eyebrow">Your request</div>
            <div className="xv-exec-request__text" title={requestText}>{request}</div>
          </div>
        ) : null}

        <div className="xv-exec-header">
          {plainChat ? null : <UniversalExecutionOrb />}
          <span className="min-w-0 flex-1">
            <ExecutionShimmerText className="xv-exec-header__state">{label}</ExecutionShimmerText>
            {capabilities.length ? (
              <span className="xv-exec-capability-line">
                <span>Ready to use:</span>
                {capabilities.map((capability) => <span key={capability}>· {capability}</span>)}
              </span>
            ) : null}
            {stalled ? (
              <span className="xv-exec-proof-line">
                <StalledDots />
                <span>Waiting for the first execution update · {durationLabel(silentForMs)}</span>
              </span>
            ) : null}
          </span>
          {family === 'research' ? <SearchScanner /> : null}
        </div>
      </section>
    );
  }

  const latest = rows.at(-1)!;
  const errors = rows.filter((row) => row.status === 'error').length;
  const stopped =
    run?.outcome === 'interrupted' ||
    rows.some((row) => row.status === 'cancelled' || row.status === 'interrupted');
  const state = stateLabel({ active, latest, errors, stopped });
  const visible = expanded ? rows : rows.slice(-DEFAULT_VISIBLE_ROWS);
  const family = familyForKind(latest.kind);
  const evidence = evidenceSummary(rows);
  const firstAt = run?.startedAt ?? Math.min(...rows.map((row) => row.startedAt));
  const lastAt = active ? now : Math.max(...rows.map((row) => row.updatedAt));
  const elapsed = durationLabel(Math.max(0, lastAt - firstAt));

  return (
    <section
      className="xv-exec-trace"
      aria-label="Execution activity"
      data-testid="terminal-live-activity"
      data-state={active ? 'active' : 'settled'}
      data-family={family}
    >
      <span className="sr-only" role="status" aria-live="polite">{latest.label}</span>

      {request ? (
        <div className="xv-exec-request">
          <div className="xv-exec-request__eyebrow">Your request</div>
          <div className="xv-exec-request__text" title={requestText}>{request}</div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="xv-exec-header focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]/45"
        aria-expanded={expanded}
      >
        {active ? (
          <UniversalExecutionOrb />
        ) : errors > 0 ? (
          <CircleX className="h-7 w-7 shrink-0 text-[var(--muted)]" aria-hidden />
        ) : stopped ? (
          <CirclePause className="h-7 w-7 shrink-0 text-[var(--muted)]" aria-hidden />
        ) : (
          <CheckCircle2 className="h-7 w-7 shrink-0 text-[var(--muted)]" aria-hidden />
        )}

        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            {active ? (
              <ExecutionShimmerText className="xv-exec-header__state">{state}</ExecutionShimmerText>
            ) : (
              <span className="xv-exec-header__state text-[var(--foreground)]">{state}</span>
            )}
            <span className="xv-exec-header__latest min-w-0 truncate text-[var(--muted)]">{latest.label}</span>
          </span>

          <span className="xv-exec-header__meta">
            <span>{rows.length} {rows.length === 1 ? 'action' : 'actions'}</span>
            {elapsed ? <span>{elapsed}</span> : null}
          </span>

          {evidence.length ? (
            <span className="xv-exec-proof-line">
              <span>Observed:</span>
              {evidence.map((item) => <span key={item}>· {item}</span>)}
            </span>
          ) : null}

          {stalled ? (
            <span className="xv-exec-proof-line">
              <StalledDots />
              <span>No new execution update for {durationLabel(silentForMs)} · still working</span>
            </span>
          ) : null}
        </span>

        {active && family === 'research' ? <SearchScanner /> : null}
        <ChevronDown
          className={cn('h-6 w-6 shrink-0 text-[var(--muted)] transition-transform', expanded && 'rotate-180')}
          aria-hidden
        />
      </button>

      <ol className="mt-2 space-y-0.5">
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
          className="xv-exec-earlier ml-9 mt-2 text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          {rows.length - DEFAULT_VISIBLE_ROWS} earlier actions · show full trace
        </button>
      ) : null}

      {expanded ? (
        <div className="xv-exec-disclaimer ml-9 mt-2 text-[var(--muted)]">
          Observable execution only · private model reasoning is never shown
        </div>
      ) : null}
    </section>
  );
}
