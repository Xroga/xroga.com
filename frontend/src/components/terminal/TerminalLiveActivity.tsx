'use client';

import { useMemo, useState } from 'react';
import {
  Brain, Check, CircleHelp, CircleX, Code2, Database, FilePen, FileText, FlaskConical,
  Globe2, LoaderCircle, MessageCircle, MonitorSmartphone, Plug, PlugZap, Rocket, Search,
  ShieldCheck, SquareTerminal, TriangleAlert, Workflow,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { coalesceActivity, type XrogaActivityKind, type XrogaActivityPresentation } from '@/lib/terminal/activityPresentation';
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
  waiting: LoaderCircle,
  complete: Check,
  warning: TriangleAlert,
  error: CircleX,
};

function ActivityRow({ row, current }: { row: XrogaActivityPresentation; current: boolean }) {
  const Icon = ICONS[row.kind];
  return (
    <li className={cn('flex min-w-0 items-start gap-2 py-0.5 text-[12px] leading-5', !current && 'text-[var(--muted)]/65')}>
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', current ? 'text-[var(--accent)]' : 'text-current')} aria-hidden />
      <span className="min-w-0 break-words">{row.label}{row.detail ? <span className="ml-1 text-[var(--muted)]">{row.detail}</span> : null}</span>
      {current && row.status === 'active' ? <LoaderCircle className="mt-1 h-3 w-3 shrink-0 motion-safe:animate-spin text-[var(--muted)]" aria-hidden /> : null}
    </li>
  );
}

interface TerminalLiveActivityProps {
  run: TerminalRunState;
}

/** One presentation-safe activity trace derived only from canonical run events. */
export function TerminalLiveActivity({ run }: TerminalLiveActivityProps) {
  const [expanded, setExpanded] = useState(false);

  const rows = useMemo(() => coalesceActivity(run.events), [run.events]);
  if (!run.active) return null;
  if (rows.length === 0) return null;

  const visible = expanded ? rows : rows.slice(-DEFAULT_VISIBLE_ROWS);
  return (
    <section className="my-1 max-w-2xl" aria-label="Xroga activity" data-testid="terminal-live-activity">
      <span className="sr-only" role="status" aria-live="polite">{rows.at(-1)?.label}</span>
      <ol className="space-y-0.5">
        {visible.map((row, index) => <ActivityRow key={row.id} row={row} current={index === visible.length - 1} />)}
      </ol>
      {rows.length > DEFAULT_VISIBLE_ROWS ? (
        <button
          type="button"
          className="mt-1 rounded text-[11px] font-medium text-[var(--muted)] underline-offset-4 hover:text-[var(--foreground)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? 'Hide activity' : `View activity (${rows.length})`}
        </button>
      ) : null}
    </section>
  );
}
