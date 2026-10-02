'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CircleHelp,
  CircleX,
  Clock3,
  Code2,
  Database,
  FileText,
  Globe2,
  LoaderCircle,
  MonitorSmartphone,
  PlugZap,
  Rocket,
  Search,
  ShieldCheck,
  SquareTerminal,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

import type { TerminalEvent, TerminalRunState } from '@/lib/terminal/terminalEvent';
import {
  PENDING_REVEAL_DELAY_MS,
  formatElapsed,
  pendingActivityLabel,
} from '@/lib/terminal/liveActivityText';

type ActivityKind =
  | 'respond'
  | 'search'
  | 'source'
  | 'file'
  | 'code'
  | 'command'
  | 'test'
  | 'browser'
  | 'database'
  | 'connection'
  | 'automation'
  | 'deploy'
  | 'verify'
  | 'approval'
  | 'waiting'
  | 'complete'
  | 'error';

const MAX_COLLAPSED_ROWS = 3;

function metadataString(event: TerminalEvent, key: string): string | null {
  const value = event.canonical?.metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function activityKind(event: TerminalEvent): ActivityKind {
  const explicit = metadataString(event, 'presentationKind');
  if (
    explicit === 'respond' ||
    explicit === 'search' ||
    explicit === 'source' ||
    explicit === 'file' ||
    explicit === 'code' ||
    explicit === 'command' ||
    explicit === 'test' ||
    explicit === 'browser' ||
    explicit === 'database' ||
    explicit === 'connection' ||
    explicit === 'automation' ||
    explicit === 'deploy' ||
    explicit === 'verify' ||
    explicit === 'approval' ||
    explicit === 'waiting' ||
    explicit === 'complete' ||
    explicit === 'error'
  ) {
    return explicit;
  }

  if (event.level === 'error' || event.kind === 'failure') return 'error';
  if (event.kind === 'permission') return 'connection';
  if (event.kind === 'result' || event.level === 'success') return 'complete';

  const canonicalType = event.canonical?.type ?? '';
  if (canonicalType.startsWith('connection.')) return 'connection';
  if (canonicalType.startsWith('approval.')) return 'approval';
  if (canonicalType.startsWith('verification.')) return 'verify';
  if (canonicalType.startsWith('file.')) return 'file';
  if (canonicalType.startsWith('tool.')) return 'command';
  if (canonicalType.startsWith('receipt.')) return 'complete';

  const text = event.text.toLowerCase();
  if (/\b(search|research|find current|looking up)\b/.test(text)) return 'search';
  if (/\b(source|evidence|reference)\b/.test(text)) return 'source';
  if (/\b(file|repository|project context|project files)\b/.test(text)) return 'file';
  if (/\b(test|check|validate|validation|compile|build check)\b/.test(text)) return 'test';
  if (/\b(command|terminal|npm |pnpm |yarn )\b/.test(text)) return 'command';
  if (/\b(code|implement|updat(?:e|ing)|patch|edit(?:ing)?)\b/.test(text)) return 'code';
  if (/\b(browser|preview|viewport|responsive)\b/.test(text)) return 'browser';
  if (/\b(database|sql|schema|record)\b/.test(text)) return 'database';
  if (/\b(connect|authori[sz]|oauth|permission)\b/.test(text)) return 'connection';
  if (/\b(workflow|automation|schedule|trigger)\b/.test(text)) return 'automation';
  if (/\b(deploy|publish|release|shipping)\b/.test(text)) return 'deploy';
  if (/\b(verify|verified|security|scan)\b/.test(text)) return 'verify';
  if (/\b(wait|queued|reconnect)\b/.test(text)) return 'waiting';
  return 'respond';
}

function iconFor(kind: ActivityKind): LucideIcon {
  switch (kind) {
    case 'search': return Search;
    case 'source': return Globe2;
    case 'file': return FileText;
    case 'code': return Code2;
    case 'command': return SquareTerminal;
    case 'test': return ShieldCheck;
    case 'browser': return MonitorSmartphone;
    case 'database': return Database;
    case 'connection': return PlugZap;
    case 'automation': return Workflow;
    case 'deploy': return Rocket;
    case 'verify': return ShieldCheck;
    case 'approval': return CircleHelp;
    case 'waiting': return Clock3;
    case 'complete': return Check;
    case 'error': return CircleX;
    default: return LoaderCircle;
  }
}

function publicActivityText(event: TerminalEvent): string {
  let text = event.text.trim();

  text = text
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/^(?:xroga\s+)?(?:architect|builder|reviewer|qa|compiler|security|converter|researcher|router)\s*[:\-–—]?\s*/i, '')
    .replace(/planning the build route/gi, 'Planning the work')
    .replace(/loading project memory/gi, 'Loading project context')
    .replace(/checking your available actions/gi, 'Checking availability')
    .replace(/request received/gi, 'Starting')
    .replace(/run complete/gi, 'Complete')
    .replace(/run finished with errors/gi, 'Could not complete the task');

  if (/still waiting on .* to return code/i.test(text)) {
    const duration = text.match(/\(([^)]+)\)\.?$/)?.[1];
    return duration ? `Waiting for generated code · ${duration}` : 'Waiting for generated code';
  }

  return text || 'Working';
}

function semanticKey(event: TerminalEvent): string {
  return (
    event.canonical?.activityId ||
    event.canonical?.eventId ||
    `${activityKind(event)}:${publicActivityText(event).toLowerCase()}`
  );
}

function coalescedRows(events: TerminalEvent[]): TerminalEvent[] {
  const result: TerminalEvent[] = [];
  const indexByKey = new Map<string, number>();

  for (const event of events) {
    if (event.kind === 'output' || event.kind === 'artifact' || event.kind === 'session') continue;
    const key = semanticKey(event);
    const existing = indexByKey.get(key);
    if (existing == null) {
      indexByKey.set(key, result.length);
      result.push(event);
    } else {
      result[existing] = event;
    }
  }

  return result;
}

function TechnicalEvidence({ event }: { event: TerminalEvent }) {
  const canonical = event.canonical;
  const metadata = canonical?.metadata ?? {};
  const rows: Array<[string, string] | null> = [
    typeof metadata.durationMs === 'number'
      ? ['Duration', formatElapsed(Math.floor(metadata.durationMs / 1000))]
      : null,
    typeof metadata.exitCode === 'number' ? ['Exit code', String(metadata.exitCode)] : null,
    typeof metadata.filePath === 'string' ? ['File', metadata.filePath] : null,
    canonical?.evidenceRefs?.length ? ['Evidence', canonical.evidenceRefs.join(', ')] : null,
  ];

  const evidence = rows.filter((row): row is [string, string] => Boolean(row));
  if (!event.body && evidence.length === 0) return null;

  return (
    <details className="ml-6 mt-1 text-[11px] text-[var(--foreground)]/55">
      <summary className="w-fit cursor-pointer select-none rounded px-1 py-0.5 hover:text-[var(--foreground)]/75">
        Details
      </summary>
      <div className="mt-1.5 space-y-1 border-l border-[var(--border-subtle)] pl-3">
        {evidence.map(([label, value]) => (
          <div key={label} className="flex min-w-0 gap-2">
            <span className="shrink-0 text-[var(--foreground)]/40">{label}</span>
            <span className="min-w-0 break-all font-mono">{value}</span>
          </div>
        ))}
        {event.body ? (
          <pre
            className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--foreground)]/[0.035] p-2 font-mono text-[10px] leading-relaxed text-[var(--foreground)]/60"
            data-testid="terminal-event-body"
          >
            {event.body}
          </pre>
        ) : null}
      </div>
    </details>
  );
}

function ActivityRow({
  event,
  current,
}: {
  event: TerminalEvent;
  current: boolean;
}) {
  const kind = activityKind(event);
  const failed = kind === 'error';
  const completed = !current || kind === 'complete' || event.level === 'success';
  const Icon = failed ? CircleX : completed ? Check : iconFor(kind);
  const animate = current && !failed && !completed && (kind === 'respond' || kind === 'waiting');

  return (
    <div className="py-0.5" data-testid="terminal-activity-row">
      <div className="flex min-w-0 items-start gap-2 text-[12px] leading-5">
        <Icon
          className={[
            'mt-0.5 h-3.5 w-3.5 shrink-0',
            failed
              ? 'text-red-500'
              : completed
                ? 'text-emerald-500/85'
                : 'text-[var(--accent)]',
            animate ? 'motion-safe:animate-spin' : '',
          ].join(' ')}
          aria-hidden="true"
        />
        <span className={completed ? 'text-[var(--foreground)]/58' : 'text-[var(--foreground)]/82'}>
          {publicActivityText(event)}
        </span>
      </div>
      <TechnicalEvidence event={event} />
    </div>
  );
}

export function TerminalLiveActivity({ run }: { run: TerminalRunState }) {
  const [showPending, setShowPending] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const rows = useMemo(() => coalescedRows(run.events), [run.events]);

  useEffect(() => {
    setShowPending(false);
    if (!run.active || rows.length > 0) return;

    const timer = window.setTimeout(() => {
      setShowPending(true);
    }, PENDING_REVEAL_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [run.active, run.startedAt, rows.length]);

  if (!run.active && rows.length === 0) return null;

  if (rows.length === 0) {
    if (!showPending) return null;

    return (
      <div
        className="my-1.5 flex w-fit items-center gap-2 text-[12px] text-[var(--foreground)]/60"
        role="status"
        aria-live="polite"
        data-testid="terminal-live-activity"
      >
        <LoaderCircle
          className="h-3.5 w-3.5 text-[var(--accent)] motion-safe:animate-spin"
          aria-hidden="true"
        />
        <span data-testid="terminal-waiting-line">{pendingActivityLabel()}</span>
      </div>
    );
  }

  const visibleRows = expanded ? rows : rows.slice(-MAX_COLLAPSED_ROWS);

  return (
    <div
      className="my-1.5 w-full max-w-xl"
      role="status"
      aria-live="polite"
      data-testid="terminal-live-activity"
    >
      <div className="space-y-0.5">
        {visibleRows.map((event, index) => {
          const absoluteIndex = expanded
            ? index
            : rows.length - visibleRows.length + index;
          return (
            <ActivityRow
              key={event.canonical?.eventId ?? `${event.seq}-${event.rawEvent}`}
              event={event}
              current={run.active && absoluteIndex === rows.length - 1}
            />
          );
        })}
      </div>

      {rows.length > MAX_COLLAPSED_ROWS ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-1 ml-5 rounded px-1 py-0.5 text-[11px] font-medium text-[var(--foreground)]/48 transition-colors hover:text-[var(--foreground)]/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/45"
        >
          {expanded ? 'Show less' : 'View activity'}
        </button>
      ) : null}
    </div>
  );
}
