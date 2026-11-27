'use client';

import { useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronDown, CircleX, CirclePause, Database, FilePen, FileSearch, FileText,
  Clock, Globe, Hand, ListTodo, Plug, Rocket, Search, ShieldCheck, SquareTerminal, type LucideIcon,
} from 'lucide-react';
import type { XrogaActivityPresentation } from '@/lib/terminal/activityPresentation';
import {
  familyOf, formatElapsed, liveLabel,
  type ActivityTimelineModel, type TimelineFamily, type TimelineItem, type TimelineTone,
} from '@/lib/terminal/activityTimeline';
import styles from './activity.module.css';
import { BlackHoleIndicator } from './BlackHoleIndicator';
import { ProcessingSurface } from './ProcessingSurface';
import type { ProcessingView } from '@/lib/terminal/processingView';
import { ProcessingStream, useOpenRows } from './ProcessingStream';
import { splitLiveStep, type StreamEntry } from '@/lib/terminal/processingStream';

const FAMILY_ICON: Record<TimelineFamily, LucideIcon> = {
  command: SquareTerminal, verify: ShieldCheck, read: FileSearch, research: Search, write: FilePen,
  browser: Globe, data: Database, connected: Plug, automation: ListTodo, transfer: FileText,
  deploy: Rocket, attention: Hand, issue: AlertTriangle, other: CheckCircle2,
};

function iconFor(family: TimelineFamily, tone: TimelineTone): LucideIcon {
  if (tone === 'failed') return CircleX;
  if (tone === 'stopped') return CirclePause;
  return FAMILY_ICON[family];
}

const HISTORY_PAGE_SIZE = 25;

function RowDetails({ rows, showLabel = true }: { rows: readonly XrogaActivityPresentation[]; showLabel?: boolean }) {
  const [visibleCount, setVisibleCount] = useState(HISTORY_PAGE_SIZE);
  return (
    <div className={styles.details}>
      {rows.slice(0, visibleCount).map(row => {
        const isCommand = row.kind === 'command';
        const duration = row.durationMs ? formatElapsed(row.durationMs) : '';
        const hasLine = showLabel || Boolean(duration) || row.exitCode !== undefined;
        return (
          <div key={row.id}>
            {hasLine ? <div className={styles.detailRow}>
              {showLabel ? <span title={row.label}>{row.label}</span> : <span />}
              {row.exitCode !== undefined ? <span className={styles.meta}>Exit {row.exitCode}</span> : null}
              {duration ? <span className={styles.meta}>{duration}</span> : null}
            </div> : null}
            {!isCommand && row.detail ? <p className={styles.context}>{row.detail}</p> : null}
            {!isCommand && row.body ? <p className={styles.context}>{row.body}</p> : null}
            {isCommand && (row.detail || row.body) ? (
              <pre className={styles.terminal} tabIndex={0} aria-label={`Output of ${row.label}`}>
                <code>
                  {row.detail ? <><span className={styles.prompt}>$ </span>{row.detail}{row.body ? '\n' : ''}</> : null}
                  {row.body}
                </code>
              </pre>
            ) : null}
          </div>
        );
      })}
      {rows.length > visibleCount ? (
        <button type="button" className={styles.earlier} onClick={() => setVisibleCount(count => count + HISTORY_PAGE_SIZE)}>Show more details</button>
      ) : null}
    </div>
  );
}

function SettledItem({ item }: { item: TimelineItem }) {
  const [open, setOpen] = useState(false);
  const Icon = iconFor(item.family, item.tone);
  const duration = item.durationMs ? formatElapsed(item.durationMs) : '';
  const expandable = item.rows.some(row => row.detail || row.body || row.exitCode !== undefined) || item.count > 1;
  return (
    <li className={styles.item} data-tone={item.tone}>
      <button
        type="button" className={styles.row} aria-expanded={expandable ? open : undefined} data-static={expandable ? undefined : 'true'}
        onClick={expandable ? () => setOpen(value => !value) : undefined} tabIndex={expandable ? 0 : -1}
      >
        <Icon className={styles.icon} aria-hidden="true" />
        <span className={styles.text} title={item.label}>{item.label}</span>
        {duration ? <span className={styles.meta}>{duration}</span> : null}
        {expandable ? <ChevronDown className={styles.chevron} aria-hidden="true" /> : null}
      </button>
      {open && expandable ? <RowDetails rows={item.rows} showLabel={item.count > 1} /> : null}
    </li>
  );
}

const EARLIER_VISIBLE = 2;

export interface ActivityTimelineProps {
  model: ActivityTimelineModel;
  /** Epoch ms from one shared clock, so every elapsed label on screen agrees. */
  now: number;
  /** Client clock reading from when the request was sent. Used only to measure the wait before the first event. */
  runStartedAt?: number | null;
  /** Wording for the live line before any activity row exists. */
  pendingLabel?: string;
  /** A measured, truthful note such as how long nothing new has arrived. */
  note?: string;
  /** Heading, paragraph and optional checklist derived from the same real rows. */
  processing?: ProcessingView;
  /** Inline work stream built from the same real rows. */
  stream?: readonly StreamEntry[];
}

export function ActivityTimeline({ model, now, runStartedAt = null, pendingLabel = 'Starting request', note, processing, stream = [] }: ActivityTimelineProps) {
  const [chosenOpen, setOpen] = useState<boolean | null>(null);
  // A run watched live keeps its stream on screen when it finishes; saved history starts folded.
  const [watched] = useState(() => model.state === 'working' || model.state === 'waiting');
  const onlyThinking = stream.every(entry => entry.type === 'step' && /:client-(?:read|thought)$/.test(entry.id));
  const open = chosenOpen ?? (watched && stream.length > 0 && !onlyThinking);
  const [streamHidden, setStreamHidden] = useState(false);
  const openRows = useOpenRows();
  const [showAll, setShowAll] = useState(false);
  const [liveOpen, setLiveOpen] = useState(false);
  const [historyCount, setHistoryCount] = useState(HISTORY_PAGE_SIZE);
  const { state, active, settled, otherActive } = model;
  const running = state === 'working' || state === 'waiting';

  // A finished run folds into one quiet header so the answer under it stays the focus.
  if (!running) {
    if (!settled.length && state !== 'failed' && state !== 'stopped') return null;
    const steps = model.total;
    const summary = [
      model.completed > 0 ? `${model.completed} completed` : '',
      model.failed > 0 ? `${model.failed} failed` : '',
    ].filter(Boolean).join(' · ');
    // The header names what this particular run did: how long it thought, when that is known.
    const thought = stream.find(entry => entry.type === 'step' && entry.id.endsWith(':client-thought') && entry.state === 'done');
    const label = state === 'failed' ? 'Run failed' : state === 'stopped' ? 'Run stopped' : thought?.text ?? 'Work history';
    // The line the header already shows is not repeated below it, unless only that line holds the sources.
    const repeatsHeader = state !== 'failed' && state !== 'stopped' && thought?.type === 'step' &&
      (!thought.evidence?.sources || stream.some(entry => entry !== thought && entry.type === 'step' && Boolean(entry.evidence?.sources)));
    const HeaderIcon = state === 'failed' ? CircleX : state === 'stopped' ? CirclePause : CheckCircle2;
    return (
      <section className={styles.timeline} aria-label="Activity" data-state={state} data-testid="activity-timeline">
        <button type="button" className={`${styles.row} ${styles.header}`} aria-expanded={steps ? open : undefined}
          disabled={!steps} onClick={() => setOpen(!open)}>
          <HeaderIcon className={styles.icon} aria-hidden="true" style={state === 'failed' ? { color: 'var(--act-danger)' } : undefined} />
          <span className={styles.text}>{label}</span>
          {steps ? <><span className={styles.meta}>{summary || (thought ? '' : `${steps} ${steps === 1 ? 'step' : 'steps'}`)}</span><ChevronDown className={styles.chevron} aria-hidden="true" /></> : null}
        </button>
        {open && stream.length ? <ProcessingStream entries={repeatsHeader ? stream.filter(entry => entry !== thought) : stream} rows={openRows} /> : null}
        {open && !stream.length ? <>
          <ol className={styles.list}>{settled.slice(0, historyCount).map(item => <SettledItem key={item.id} item={item} />)}</ol>
          {settled.length > historyCount ? (
            <button type="button" className={styles.earlier} onClick={() => setHistoryCount(count => count + HISTORY_PAGE_SIZE)}>Show more steps</button>
          ) : null}
        </> : null}
      </section>
    );
  }

  const hidden = Math.max(0, settled.length - (showAll ? historyCount : EARLIER_VISIBLE));
  const shown = hidden ? settled.slice(hidden) : settled;
  const earlierSteps = settled.slice(0, hidden).reduce((count, item) => count + item.count, 0);
  const text = active ? liveLabel(active, otherActive) : pendingLabel;
  const startedAt = runStartedAt ?? active?.startedAt ?? null;
  const elapsed = startedAt ? formatElapsed(now - startedAt) : '';
  const waiting = state === 'waiting';
  const WaitingIcon = active?.kind === 'approval' || active?.kind === 'connection' ? Hand : Clock;
  const hasStream = stream.length > 0;
  const hasDetails = Boolean(active || settled.length || hasStream);
  const LiveIcon = active ? FAMILY_ICON[familyOf(active.kind)] : null;

  const work = splitLiveStep(stream);
  // A written note is already on screen above, so the working line never repeats it.
  // A running step that stays in the stream (it has output to open) is not named a second time here.
  const lineText = waiting ? text : (work.live?.evidence ? text : work.live?.text) ?? (stream.at(-1)?.type === 'note' ? 'Thinking' : text);
  const family = work.live?.family ?? (active ? familyOf(active.kind) : 'other');

  return (
    <section className={styles.timeline} aria-label="Activity" data-state={state} data-testid="activity-timeline">
      <span className={styles.sr} role="status" aria-live="polite">{lineText}</span>
      <div className={styles.working} data-waiting={waiting ? 'true' : undefined}>
        {processing?.checklist && (!hasStream || processing.checklistSource === 'plan') ? <ProcessingSurface view={processing} listOnly /> : null}
        {work.entries.length && !streamHidden ? <ProcessingStream entries={work.entries} rows={openRows} /> : null}
        {!hasStream && liveOpen && hasDetails ? <div className={styles.workingDetails}>
          {hidden > 0 ? <button type="button" className={styles.earlier} onClick={() => {
            if (showAll) setHistoryCount(count => count + HISTORY_PAGE_SIZE);
            else setShowAll(true);
          }}>
            {`Show earlier steps (${earlierSteps})`}
          </button> : null}
          {shown.length || active ? <ol className={styles.list}>
            {shown.map(item => <SettledItem key={item.id} item={item} />)}
            {active && LiveIcon ? <li className={styles.item}>
              <div className={`${styles.row} ${styles.currentStep}`} data-static="true">
                <LiveIcon className={styles.icon} aria-hidden="true" />
                <span>{active.label}</span>
              </div>
              {active.detail || active.body ? <RowDetails key={active.id} rows={[active]} showLabel={false} /> : null}
            </li> : null}
          </ol> : null}
        </div> : null}
        {note ? <p className={styles.note}>{note}</p> : null}
        {/* The working line follows the work, like a cursor: new steps appear above it. */}
        <button type="button" className={`${styles.row} ${styles.liveLine}`} data-testid="live-line"
          aria-expanded={hasStream ? !streamHidden : hasDetails ? liveOpen : undefined} data-static={hasDetails ? undefined : 'true'}
          onClick={hasStream ? () => setStreamHidden(value => !value) : hasDetails ? () => setLiveOpen(value => !value) : undefined} tabIndex={hasDetails ? 0 : -1}>
          {waiting ? <WaitingIcon className={styles.icon} aria-hidden="true" /> : <BlackHoleIndicator family={family} />}
          {waiting ? null : <span className={styles.sr}>Black Hole is working</span>}
          <span className={styles.liveText} title={lineText}>{lineText}</span>
          {elapsed ? <span className={styles.meta} aria-hidden="true">{elapsed}</span> : null}
          {hasDetails ? <ChevronDown className={styles.chevron} aria-hidden="true" /> : null}
        </button>
      </div>
    </section>
  );
}
