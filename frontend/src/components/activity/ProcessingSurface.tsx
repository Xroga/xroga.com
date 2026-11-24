'use client';

import { useState } from 'react';
import {
  AlertTriangle, Brain, Check, ChevronDown, CircleDashed, CircleX, Clock, Database, FilePen, FileSearch, Globe, Hand,
  ListTodo, Minus, Plug, Rocket, Search, ShieldCheck, SquareTerminal, type LucideIcon,
} from 'lucide-react';
import type { TimelineFamily } from '@/lib/terminal/activityTimeline';
import type { ProcessingChecklistItem, ProcessingTone, ProcessingView } from '@/lib/terminal/processingView';
import styles from './processing.module.css';

const FAMILY_ICON: Record<TimelineFamily | 'start', LucideIcon> = {
  start: Clock, command: SquareTerminal, verify: ShieldCheck, read: FileSearch, research: Search, write: FilePen,
  browser: Globe, data: Database, connected: Plug, automation: ListTodo, transfer: FilePen,
  deploy: Rocket, attention: Hand, issue: AlertTriangle, other: Brain,
};

function StepMark({ status }: { status: ProcessingChecklistItem['status'] }) {
  if (status === 'done') return <Check className={styles.stepIcon} aria-hidden="true" strokeWidth={2.6} />;
  if (status === 'failed') return <CircleX className={styles.stepIcon} aria-hidden="true" />;
  if (status === 'skipped') return <Minus className={styles.stepIcon} aria-hidden="true" />;
  if (status === 'active') return <span className={styles.stepDot} aria-hidden="true" />;
  return <CircleDashed className={styles.stepIcon} aria-hidden="true" />;
}

const STATUS_WORD: Record<ProcessingChecklistItem['status'], string> = {
  pending: 'pending', active: 'in progress', done: 'done', failed: 'failed', skipped: 'skipped',
};

/**
 * Compact live surface above an in-progress answer: a dynamic heading, a short natural-language paragraph and,
 * for genuinely multi-stage requests, a collapsible checklist. All text comes from `buildProcessingView`, which
 * derives it from real execution events. The wrapper is re-keyed by heading so the text eases in on change.
 */
export function ProcessingSurface({ view, tone }: { view: ProcessingView; tone?: ProcessingTone }) {
  const [listOpen, setListOpen] = useState(true);
  const Icon = FAMILY_ICON[view.family] ?? Brain;
  const checklist = view.checklist;
  const finished = checklist?.filter(item => item.status === 'done').length ?? 0;
  const showCopy = view.family !== 'start';

  if (!showCopy && !checklist) return null;
  return (
    <div className={styles.surface} data-tone={tone ?? view.tone} data-testid="processing-surface">
      {showCopy ? (
        <div className={styles.copy} key={view.heading}>
          <p className={styles.heading}><Icon className={styles.headingIcon} aria-hidden="true" /><span>{view.heading}</span></p>
          <p className={styles.paragraph} key={view.paragraph}>{view.paragraph}</p>
        </div>
      ) : null}
      {checklist ? (
        <div className={styles.checklist}>
          <button type="button" className={styles.listToggle} aria-expanded={listOpen} onClick={() => setListOpen(open => !open)}>
            <ListTodo className={styles.headingIcon} aria-hidden="true" />
            <span>Plan</span>
            <span className={styles.count}>{finished} of {checklist.length} done</span>
            <ChevronDown className={styles.chevron} aria-hidden="true" />
          </button>
          {listOpen ? (
            <ol className={styles.steps} aria-label="Plan steps">
              {checklist.map(item => (
                <li key={item.id} className={styles.step} data-status={item.status}>
                  <StepMark status={item.status} />
                  <span>{item.label}</span>
                  <span className={styles.sr}>{STATUS_WORD[item.status]}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
