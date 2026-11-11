'use client';

import { useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronDown, CircleX, CirclePause, Database, FilePen, FileSearch, FileText,
  Globe, Hand, ListTodo, Plug, Rocket, Search, ShieldCheck, SquareTerminal, type LucideIcon,
} from 'lucide-react';
import type { XrogaActivityPresentation } from '@/lib/terminal/activityPresentation';
import {
  familyOf, formatElapsed, liveLabel,
  type ActivityTimelineModel, type TimelineFamily, type TimelineItem, type TimelineTone,
} from '@/lib/terminal/activityTimeline';
import styles from './activity.module.css';

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

/** Four small dots. Motion stops under prefers-reduced-motion (see the stylesheet). */
export function ActivitySpinner() {
  return <span className={styles.spinner} aria-hidden="true"><i /><i /><i /><i /></span>;
}

const COMMANDLIKE = new Set(['command', 'test', 'verify', 'error', 'warning']);

function RowDetails({ rows, showLabel = true }: { rows: readonly XrogaActivityPresentation[]; showLabel?: boolean }) {
  return (
    <div className={styles.details}>
      {rows.map(row => {
        const isCommand = COMMANDLIKE.has(row.kind);
        const duration = row.durationMs ? formatElapsed(row.durationMs) : '';
        const hasLine = showLabel || Boolean(duration);
        return (
          <div key={row.id}>
            {hasLine ? <div className={styles.detailRow}>
              {showLabel ? <span title={row.label}>{row.label}</span> : <span />}
              {duration ? <span className={styles.meta}>{duration}</span> : null}
            </div> : null}
            {!isCommand && row.detail ? <p className={styles.context}>{row.detail}</p> : null}
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
    </div>
  );
}

function SettledItem({ item }: { item: TimelineItem }) {
  const [open, setOpen] = useState(false);
  const Icon = iconFor(item.family, item.tone);
  const duration = item.durationMs ? formatElapsed(item.durationMs) : '';
  const expandable = item.rows.some(row => row.detail || row.body) || item.count > 1;
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
  const { state, active, settled, otherActive } = model;
  const running = state === 'working' || state === 'waiting';

  // A finished run folds into one quiet header so the answer under it stays the focus.
  if (!running) {
    if (!settled.length && state !== 'failed' && state !== 'stopped') return null;
    const steps = model.total;
    const label = state === 'failed' ? 'Run failed' : state === 'stopped' ? 'Run stopped' : 'Work history';
    const HeaderIcon = state === 'failed' ? CircleX : state === 'stopped' ? CirclePause : CheckCircle2;
    return (
      <section className={styles.timeline} aria-label="Activity" data-state={state} data-testid="activity-timeline">
        <button type="button" className={`${styles.row} ${styles.header}`} aria-expanded={steps ? open : undefined}
          disabled={!steps} onClick={() => setOpen(value => !value)}>
          <HeaderIcon className={styles.icon} aria-hidden="true" style={state === 'failed' ? { color: 'var(--act-danger)' } : undefined} />
          <span className={styles.text}>{label}</span>
          {steps ? <><span className={styles.meta}>{steps} {steps === 1 ? 'step' : 'steps'}</span><ChevronDown className={styles.chevron} aria-hidden="true" /></> : null}
        </button>
        {open ? <ol className={styles.list}>{settled.map(item => <SettledItem key={item.id} item={item} />)}</ol> : null}
      </section>
    );
  }

  const hidden = !showAll ? Math.max(0, settled.length - EARLIER_VISIBLE) : 0;
  const shown = hidden ? settled.slice(hidden) : settled;
  const earlierSteps = settled.slice(0, hidden).reduce((count, item) => count + item.count, 0);
  const text = active ? liveLabel(active, otherActive) : pendingLabel;
  const startedAt = active?.startedAt ?? runStartedAt ?? null;
  const elapsed = startedAt ? formatElapsed(now - startedAt) : '';
  const waiting = state === 'waiting';
  const hasDetails = Boolean(active && (active.detail || active.body));
  const LiveIcon = active ? FAMILY_ICON[familyOf(active.kind)] : null;

  return (
    <section className={styles.timeline} aria-label="Activity" data-state={state} data-testid="activity-timeline">
      <span className={styles.sr} role="status" aria-live="polite">{text}</span>
      <div className={`${styles.item} ${styles.live}`} data-waiting={waiting ? 'true' : undefined}>
        <button type="button" className={`${styles.row} ${styles.live}`} data-waiting={waiting ? 'true' : undefined}
          aria-expanded={hasDetails ? liveOpen : undefined} data-static={hasDetails ? undefined : 'true'}
          onClick={hasDetails ? () => setLiveOpen(value => !value) : undefined} tabIndex={hasDetails ? 0 : -1}>
          {waiting ? <Hand className={styles.icon} aria-hidden="true" /> : LiveIcon ? <LiveIcon className={styles.liveIcon} aria-hidden="true" /> : <ActivitySpinner />}
          <span className={styles.text} key={text} title={text}>{text}</span>
          {elapsed ? <span className={styles.meta}>{elapsed}</span> : null}
          {hasDetails ? <ChevronDown className={styles.chevron} aria-hidden="true" /> : null}
        </button>
        {liveOpen && active && hasDetails ? <RowDetails rows={[active]} showLabel={false} /> : null}
        {note ? <p className={styles.note}>{note}</p> : null}
      </div>
      {shown.length ? <ol className={styles.recent}>{shown.map(item => <SettledItem key={item.id} item={item} />)}</ol> : null}
      {settled.length > EARLIER_VISIBLE ? <button type="button" className={styles.earlier} aria-expanded={showAll}
        onClick={() => setShowAll(value => !value)}>
        {showAll ? 'Show fewer steps' : `Show ${earlierSteps} earlier ${earlierSteps === 1 ? 'step' : 'steps'}`}
      </button> : null}
    </section>
  );
}
