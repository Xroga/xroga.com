// The activity block shows the current operation or response state, then folds into one history disclosure with
// a row per tool call in plain language, its status, the
// effect when the page did not react, how a write was allowed, and on expanding, the arguments (typed values masked),
// the receipt and the error hint. Page strings are text nodes only.
import { useEffect, useState } from 'react';
import type { ToolRow } from '@src/ui/protocol';
import { t } from '@src/ui/i18n';
import type { MessageKey } from '@src/ui/i18n';
import { activityLine, liveToolLabel, maskArgs } from './activity-label';
import { CheckIcon, ChevronIcon, CloseIcon, HistoryIcon, SpinnerIcon } from '@src/ui/icons';

export type Phase = 'starting' | 'between' | 'writing' | 'working' | 'waiting';

const PHASES: Record<Phase, MessageKey> = {
  starting: 'activity.starting',
  between: 'activity.between',
  writing: 'activity.writing',
  working: 'activity.working',
  waiting: 'activity.waiting',
};

const ICONS: Record<ToolRow['status'], string> = { running: '…', done: '✓', failed: '✗', skipped: '–', waiting: '!' };
const TONES: Record<ToolRow['status'], string> = {
  running: 'text-nb-link',
  done: 'text-emerald-600 dark:text-emerald-400',
  failed: 'text-red-600 dark:text-red-400',
  skipped: 'text-nb-muted',
  waiting: 'text-amber-600 dark:text-amber-400',
};
const STATUS: Partial<Record<ToolRow['status'], Parameters<typeof t>[0]>> = {
  running: 'act.running',
  waiting: 'act.waiting',
  skipped: 'act.skipped',
  failed: 'act.failed',
};

/** Only a tool start, a prompt or visible response text can identify a specific live phase. */
export function phaseOf(rows: ToolRow[], waiting: boolean, writing = false, responseStarted = writing): Phase {
  if (waiting || rows.some(r => r.status === 'waiting')) return 'waiting';
  if (rows.some(r => r.status === 'running')) return 'working';
  if (writing) return 'writing';
  return rows.length || responseStarted ? 'between' : 'starting';
}

/** "4s", "2m 5s", "1h 3m". */
export function elapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return t('activity.hours', { h, m });
  if (m) return t('activity.minutes', { m, s });
  return t('activity.seconds', { s });
}

/** The current time, every second while `live`. */
function useNow(live: boolean): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!live) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [live]);
  return now;
}

/**
 * `phase` is set while the run works and `start` is when it began, in ms; `end`, when its last reply came, gives
 * "Worked for" once it has stopped.
 */
export function Activity({ rows, phase, start, end }: { rows: ToolRow[]; phase?: Phase; start: number; end?: number }) {
  const [open, setOpen] = useState(false);
  const now = useNow(!!phase);
  const time = elapsed((phase ? now : (end ?? start)) - start);
  const running = phase === 'working' ? rows.findLast(row => row.status === 'running') : undefined;
  const latest = rows.findLast(row => row.status !== 'running' && row.status !== 'waiting');
  const label = running ? liveToolLabel(running) : phase ? t(PHASES[phase]) : t('activity.worked', { time });
  const status = (
    <>
      {phase && phase !== 'waiting' ? (
        <SpinnerIcon size={14} className="shrink-0 text-nb-link motion-safe:animate-spin" />
      ) : (
        <HistoryIcon size={14} className={phase ? 'shrink-0 text-amber-600 dark:text-amber-400' : 'shrink-0'} />
      )}
      <span className={`min-w-0 flex-1 break-words ${phase ? 'font-medium text-nb-fg' : ''}`}>{label}</span>
      {phase ? <span className="shrink-0 tabular-nums opacity-70">{time}</span> : null}
    </>
  );
  return (
    <div className="flex min-w-0 flex-col gap-1" data-role="activity" data-phase={phase}>
      {phase ? <span className="sr-only" role="status">{label}</span> : null}
      {rows.length ? (
        <button
          type="button"
          aria-expanded={open}
          className="flex max-w-full items-center gap-2 self-start rounded-lg p-1 text-left text-nb-muted transition-colors hover:bg-nb-surface hover:text-nb-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-nb-accent"
          onClick={() => setOpen(o => !o)}>
          {status}
          <ChevronIcon size={14} className={`shrink-0 motion-safe:transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
      ) : (
        <div className="flex max-w-full items-center gap-2 self-start p-1 text-nb-muted">{status}</div>
      )}
      {phase && !open && latest ? (
        <p className="ml-2.5 break-words border-l border-nb-border pl-3 text-xs text-nb-muted">
          {latest.status === 'done' ? activityLine(latest).label : t('activity.stepOutcome', {
            action: liveToolLabel(latest), outcome: t(latest.status === 'failed' ? 'act.failed' : 'act.skipped'),
          })}
        </p>
      ) : null}
      {open && rows.length ? (
        <ul className="flex flex-col gap-0.5 rounded-xl border border-nb-border bg-nb-bg px-2.5 py-1.5 text-xs shadow-sm">
          {rows.map(row => (
            <Row key={row.toolCallId} row={row} live={Boolean(phase)} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Row({ row, live }: { row: ToolRow; live: boolean }) {
  const [open, setOpen] = useState(false);
  const line = activityLine(row);
  const unconfirmed = !live && (row.status === 'running' || row.status === 'waiting');
  const status = unconfirmed ? 'activity.unconfirmed' : STATUS[row.status];
  const result = row.result as { receipt?: unknown; error?: { hint?: string } } | undefined;
  return (
    <li className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        className="flex items-start gap-1.5 rounded-md px-1 py-0.5 text-left hover:bg-nb-surface"
        onClick={() => setOpen(o => !o)}>
        <span aria-hidden className={`w-3 shrink-0 text-center font-semibold ${TONES[row.status]}`}>
          {unconfirmed ? '–' : row.status === 'done' ? <CheckIcon size={13} /> : row.status === 'failed' ? <CloseIcon size={13} />
            : row.status === 'running' ? <SpinnerIcon size={13} className="motion-safe:animate-spin" /> : ICONS[row.status]}
        </span>
        <span className="min-w-0 flex-1 break-words">
          {row.status === 'done' ? line.label : liveToolLabel(row)}
          {[...(status ? [t(status)] : []), ...line.tags].map(tag => (
            <span key={tag} className="ml-1 rounded-full bg-nb-surface px-1.5 text-[10px] text-nb-muted">
              {tag}
            </span>
          ))}
        </span>
      </button>
      {row.thumbnail ? (
        <img
          src={row.thumbnail}
          alt={t('act.thumbnail')}
          className="ml-5 mt-0.5 h-16 w-auto self-start rounded-md border border-nb-border"
        />
      ) : null}
      {line.details.map(d => (
        <span key={d} className="ml-5 text-[11px] text-nb-muted">
          {d}
        </span>
      ))}
      {open ? (
        <div className="ml-5 flex flex-col gap-1 py-1">
          {row.args !== undefined && !row.tool.startsWith('plugin_') ? <Detail title={t('act.arguments')} value={maskArgs(row.args)} /> : null}
          {result?.receipt ? <Detail title={t('act.result')} value={result.receipt} /> : null}
          {result?.error?.hint ? <Detail title={t('act.hint')} value={result.error.hint} /> : null}
        </div>
      ) : null}
    </li>
  );
}

function Detail({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <span className="text-nb-muted">{title}</span>
      <pre className="whitespace-pre-wrap break-words rounded-md bg-nb-surface p-1.5 font-mono text-[11px]">
        {typeof value === 'string' ? value : JSON.stringify(value, null, 1)}
      </pre>
    </div>
  );
}
