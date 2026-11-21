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
}

export function ActivityTimeline({ model, now, runStartedAt = null, pendingLabel = 'Starting request', note }: ActivityTimelineProps) {
  const [open, setOpen] = useState(false);
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
      model.unconfirmed > 0 ? `${model.unconfirmed} unconfirmed` : '',
    ].filter(Boolean).join(' · ');
    const label = state === 'failed' ? 'Run failed' : state === 'stopped' ? 'Run stopped' : 'Work history';
    const HeaderIcon = state === 'failed' ? CircleX : state === 'stopped' ? CirclePause : CheckCircle2;
    return (
      <section className={styles.timeline} aria-label="Activity" data-state={state} data-testid="activity-timeline">
        <button type="button" className={`${styles.row} ${styles.header}`} aria-expanded={steps ? open : undefined}
          disabled={!steps} onClick={() => setOpen(value => !value)}>
          <HeaderIcon className={styles.icon} aria-hidden="true" style={state === 'failed' ? { color: 'var(--act-danger)' } : undefined} />
          <span className={styles.text}>{label}</span>
          {steps ? <><span className={styles.meta}>{summary || `${steps} ${steps === 1 ? 'step' : 'steps'}`}</span><ChevronDown className={styles.chevron} aria-hidden="true" /></> : null}
        </button>
        {open ? <>
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
  const hasDetails = Boolean(active || settled.length);
  const LiveIcon = active ? FAMILY_ICON[familyOf(active.kind)] : null;

  return (
    <section className={styles.timeline} aria-label="Activity" data-state={state} data-testid="activity-timeline">
      <span className={styles.sr} role="status" aria-live="polite">{text}</span>
      <div className={styles.workingPanel} data-waiting={waiting ? 'true' : undefined}>
        <button type="button" className={`${styles.row} ${styles.workingHeader}`}
          aria-expanded={hasDetails ? liveOpen : undefined} data-static={hasDetails ? undefined : 'true'}
          onClick={hasDetails ? () => setLiveOpen(value => !value) : undefined} tabIndex={hasDetails ? 0 : -1}>
          {waiting ? <WaitingIcon className={styles.icon} aria-hidden="true" /> : <BlackHoleIndicator />}
          <span className={styles.workingCopy}>
            <span className={styles.workingTitle}>
              <span>{waiting ? text : 'Black Hole is working'}</span>
              {elapsed ? <span className={styles.meta} aria-hidden="true">{elapsed}</span> : null}
            </span>
            {!waiting ? <span className={styles.stage}>{text}</span> : null}
          </span>
          {hasDetails ? <ChevronDown className={styles.chevron} aria-hidden="true" /> : null}
        </button>
        {liveOpen && hasDetails ? <div className={styles.workingDetails}>
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
      </div>
    </section>
  );
}
