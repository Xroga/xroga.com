'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Brain, Check, ChevronDown, CircleAlert, CircleDashed, Clock, Database, FilePen, FileSearch, Globe, Hand,
  ListChecks, LoaderCircle, Minus, Plug, Rocket, Search, ShieldCheck, SquareTerminal, Wrench, type LucideIcon,
} from 'lucide-react';
import type { TimelineFamily } from '@/lib/terminal/activityTimeline';
import type { ProcessingChecklistItem, ProcessingTone, ProcessingView } from '@/lib/terminal/processingView';
import styles from './processing.module.css';

/** One icon per kind of real work. The icon names the work; its colour (see processing.module.css) names the state. */
const FAMILY_ICON: Record<TimelineFamily | 'start', LucideIcon> = {
  start: Clock, command: SquareTerminal, verify: ShieldCheck, read: FileSearch, research: Search, write: FilePen,
  browser: Globe, data: Database, connected: Plug, automation: Wrench, transfer: FilePen,
  deploy: Rocket, attention: Hand, issue: CircleAlert, other: Brain,
};

const STATUS_WORD: Record<ProcessingChecklistItem['status'], string> = {
  pending: 'pending', active: 'in progress', done: 'done', failed: 'failed', skipped: 'skipped',
};

/** Largest list that opens by default. Longer ones start collapsed so the surface stays compact. */
const DEFAULT_OPEN_MAX = 6;

function StepMark({ item, reduced }: { item: ProcessingChecklistItem; reduced: boolean }) {
  const Family = item.family ? FAMILY_ICON[item.family] : CircleDashed;
  let mark;
  if (item.status === 'done') mark = <Check className={styles.stepIcon} aria-hidden="true" strokeWidth={2.6} />;
  else if (item.status === 'failed') mark = <CircleAlert className={styles.stepIcon} aria-hidden="true" />;
  else if (item.status === 'skipped') mark = <Minus className={styles.stepIcon} aria-hidden="true" />;
  else if (item.status === 'active') mark = <LoaderCircle className={`${styles.stepIcon} ${styles.spin}`} aria-hidden="true" />;
  else mark = <Family className={styles.stepIcon} aria-hidden="true" />;
  return (
    <span className={styles.mark}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={item.status}
          className={styles.markInner}
          initial={reduced ? false : { opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={reduced ? undefined : { opacity: 0, scale: 0.6 }}
          transition={{ duration: reduced ? 0 : 0.18, ease: 'easeOut' }}
        >
          {mark}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** Text that eases out and in when it really changes. Same box, so nothing jumps. */
function SwapText({ text, className, reduced }: { text: string; className?: string; reduced: boolean }) {
  return (
    <span className={`${styles.swap} ${className ?? ''}`}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={text}
          className={styles.swapInner}
          initial={reduced ? false : { opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? undefined : { opacity: 0, y: -5 }}
          transition={{ duration: reduced ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/**
 * Compact live surface above an in-progress answer: a heading, one short natural-language paragraph and, when a
 * request genuinely has several steps, a collapsible list. Every word comes from `buildProcessingView`, which reads
 * real execution events or the backend's own plan. Text and icons change only when those change, with a short fade
 * and slide. Reduced-motion users get the same content with no movement.
 */
export function ProcessingSurface({ view, tone, listOnly = false }: { view: ProcessingView; tone?: ProcessingTone; listOnly?: boolean }) {
  const reduced = useReducedMotion() ?? false;
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const Icon = FAMILY_ICON[view.family] ?? Brain;
  const checklist = view.checklist;
  const finished = checklist?.filter(item => item.status === 'done').length ?? 0;
  const current = checklist?.findLast(item => item.status === 'active') ?? null;
  const showCopy = !listOnly && view.family !== 'start';
  const open = userOpen ?? ((checklist?.length ?? 0) <= DEFAULT_OPEN_MAX);
  const title = view.checklistSource === 'plan' ? 'Plan' : 'Progress';
  const live = (tone ?? view.tone) !== 'error' && (tone ?? view.tone) !== 'warning';

  if (!showCopy && !checklist) return null;
  return (
    <div className={styles.surface} data-tone={tone ?? view.tone} data-testid="processing-surface">
      {showCopy ? (
        <div className={styles.copy}>
          <p className={styles.heading}>
            <span className={styles.headingMark}>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={`${view.family}-${view.tone}`}
                  className={styles.markInner}
                  initial={reduced ? false : { opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reduced ? undefined : { opacity: 0, scale: 0.7 }}
                  transition={{ duration: reduced ? 0 : 0.18 }}
                >
                  <Icon className={styles.headingIcon} data-live={live ? 'true' : undefined} aria-hidden="true" />
                </motion.span>
              </AnimatePresence>
            </span>
            <SwapText text={view.heading} reduced={reduced} />
          </p>
          <p className={styles.paragraph}>
            <SwapText text={view.paragraph} reduced={reduced} />
          </p>
        </div>
      ) : null}
      {checklist ? (
        <div className={styles.checklist}>
          <button
            type="button"
            className={styles.listToggle}
            aria-expanded={open}
            onClick={() => setUserOpen(!open)}
          >
            <ListChecks className={styles.toggleIcon} aria-hidden="true" />
            <span className={styles.toggleTitle}>{title}</span>
            {!open && current ? <span className={styles.current} title={current.label}>{current.label}</span> : null}
            <span className={styles.count}>{finished} of {checklist.length} done</span>
            <ChevronDown className={styles.chevron} aria-hidden="true" />
          </button>
          {open ? (
            <ol className={styles.steps} aria-label={`${title} steps`}>
              {checklist.map(item => (
                <motion.li
                  key={item.id}
                  className={styles.step}
                  data-status={item.status}
                  initial={reduced ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduced ? 0 : 0.2, ease: 'easeOut' }}
                >
                  <StepMark item={item} reduced={reduced} />
                  <span className={styles.stepLabel}>{item.label}</span>
                  <span className={styles.sr}>{STATUS_WORD[item.status]}</span>
                </motion.li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
