'use client';

import { useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Brain, ChevronDown, CircleAlert, CircleCheck, CircleDashed, Database, ExternalLink, FilePen, FileSearch, Globe, Hand, ListChecks, LoaderCircle, Plug,
  Rocket, Search, ShieldCheck, SquareTerminal, Wrench, type LucideIcon,
} from 'lucide-react';
import { formatElapsed, type TimelineFamily } from '@/lib/terminal/activityTimeline';
import { groupStream, type PlanStatus, type StreamEntry, type StreamEvidence, type StreamStep } from '@/lib/terminal/processingStream';
import styles from './processing.module.css';

const ICON: Record<TimelineFamily, LucideIcon> = {
  command: SquareTerminal, verify: ShieldCheck, read: FileSearch, research: Search, write: FilePen, browser: Globe,
  data: Database, connected: Plug, automation: ListChecks, transfer: Wrench, deploy: Rocket, attention: Hand,
  issue: CircleAlert, other: Brain,
};

const host = (url: string): string => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
};

/** What a step really reported: the command and its output, written notes, or the pages it used. */
function Evidence({ evidence }: { evidence: StreamEvidence }) {
  const duration = evidence.durationMs ? formatElapsed(evidence.durationMs) : '';
  const shell = evidence.command || evidence.output;
  return (
    <div className={styles.evidence}>
      {shell ? (
        <div className={styles.shell}>
          <div className={styles.shellBar}>
            <span>Shell</span>
            <span>{[evidence.exitCode !== undefined ? `exit ${evidence.exitCode}` : '', duration].filter(Boolean).join(' · ')}</span>
          </div>
          <pre tabIndex={0} aria-label="Command and output">
            <code>
              {evidence.command ? <><span className={styles.prompt}>$ </span>{evidence.command}{evidence.output ? '\n\n' : ''}</> : null}
              {evidence.output}
            </code>
          </pre>
        </div>
      ) : null}
      {evidence.notes ? <pre className={styles.noteBlock} tabIndex={0} aria-label="Details"><code>{evidence.notes}</code></pre> : null}
      {evidence.sources ? (
        <ul className={styles.sources} aria-label="Sources">
          {evidence.sources.map(source => (
            <li key={source.url}>
              <a href={source.url} target="_blank" rel="noopener noreferrer nofollow" title={source.url}>
                <Globe aria-hidden="true" />
                <span className={styles.sourceTitle}>{source.title}</span>
                <span className={styles.sourceHost}>{host(source.url)}</span>
                <ExternalLink aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Which rows the reader opened. Held above the stream so finishing a run never closes them. */
export interface OpenRows { ids: ReadonlySet<string>; toggle: (id: string) => void }

export function useOpenRows(): OpenRows {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());
  return {
    ids,
    toggle: id => setIds(previous => {
      const next = new Set(previous);
      if (!next.delete(id)) next.add(id);
      return next;
    }),
  };
}

function StepLine({ step, rows }: { step: StreamStep; rows: OpenRows }) {
  const open = rows.ids.has(step.id);
  const Icon = ICON[step.family];
  const body = (
    <>
      <Icon className={styles.lineIcon} aria-hidden="true" />
      <span className={styles.lineText}>
        {step.text}{step.detail ? <span className={styles.lineDetail}> {step.detail}</span> : null}
      </span>
      {step.state === 'failed' ? <span className={styles.sr}>failed</span> : null}
    </>
  );
  return (
    <div className={styles.line} data-state={step.state}>
      {step.evidence ? (
        <button type="button" className={styles.lineButton} aria-expanded={open} onClick={() => rows.toggle(step.id)}>
          {body}<ChevronDown className={styles.lineChevron} aria-hidden="true" />
        </button>
      ) : <div className={styles.lineButton} data-static="true">{body}</div>}
      {open && step.evidence ? <Evidence evidence={step.evidence} /> : null}
    </div>
  );
}

function Group({ id, title, families, steps, rows }: { id: string; title: string; families: TimelineFamily[]; steps: StreamStep[]; rows: OpenRows }) {
  const open = rows.ids.has(id);
  return (
    <div className={styles.group}>
      <button type="button" className={`${styles.lineButton} ${styles.groupButton}`} aria-expanded={open} onClick={() => rows.toggle(id)}>
        <span className={styles.groupIcons} aria-hidden="true">
          {families.slice(0, 3).map(family => { const Icon = ICON[family]; return <Icon key={family} className={styles.lineIcon} />; })}
        </span>
        <span className={styles.lineText}>{title} <span className={styles.lineDetail}>({steps.length})</span></span>
        <ChevronDown className={styles.lineChevron} aria-hidden="true" />
      </button>
      {open ? <ol className={styles.groupSteps}>{steps.map(step => <li key={step.id}><StepLine step={step} rows={rows} /></li>)}</ol> : null}
    </div>
  );
}

const PLAN_WORD: Record<PlanStatus, string> = { pending: 'pending', active: 'in progress', done: 'done', failed: 'failed' };

function PlanMark({ number, status }: { number?: number; status?: PlanStatus }) {
  if (!status) return <span className={styles.planNumber} aria-hidden="true">{number}</span>;
  const Icon = status === 'done' ? CircleCheck : status === 'active' ? LoaderCircle : status === 'failed' ? CircleAlert : CircleDashed;
  // Keyed by state so a newly finished step pops its tick in.
  return <Icon key={status} className={styles.planMark} aria-hidden="true" />;
}

/**
 * Inline work stream: written updates, the running step (shimmering), and finished steps folded under one
 * summary that opens to each operation and, below that, to its command output or sources.
 */
export function ProcessingStream({ entries, rows }: { entries: readonly StreamEntry[]; rows: OpenRows }) {
  const reduced = useReducedMotion() ?? false;
  if (!entries.length) return null;
  return (
    <ol className={styles.stream} data-testid="processing-stream" aria-label="Work so far">
      {groupStream(entries).map(entry => {
        let content: ReactNode;
        if (entry.type === 'plan') {
          // Written by the model for this request. A step is marked only from events the run reported; a plan
          // without that information stays numbered.
          const tracked = entry.steps.every(step => step.planStatus);
          const done = entry.steps.filter(step => step.planStatus === 'done').length;
          content = (
            <div className={styles.planCard}>
              <p className={styles.planTitle}>
                <span>{entry.text}</span>
                {tracked ? <span className={styles.planCount}>{done} of {entry.steps.length} done</span> : null}
              </p>
              <ol className={styles.planList}>
                {entry.steps.map((step, index) => (
                  <motion.li key={step.id} className={styles.planStep} data-status={step.planStatus}
                    initial={reduced ? false : { opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: reduced ? 0 : 0.22, delay: reduced ? 0 : Math.min(index, 6) * 0.05 }}>
                    <PlanMark number={step.planNumber} status={step.planStatus} />
                    <span className={styles.planText}>{step.text}</span>
                    {step.planStatus ? <span className={styles.sr}>{PLAN_WORD[step.planStatus]}</span> : null}
                  </motion.li>
                ))}
              </ol>
            </div>
          );
        } else if (entry.type === 'note') content = <p className={styles.note}>{entry.text}</p>;
        else if (entry.type === 'group') content = <Group id={entry.id} title={entry.text} families={entry.families} steps={entry.steps} rows={rows} />;
        else content = <StepLine step={entry} rows={rows} />;
        return (
          <motion.li
            key={entry.id}
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduced ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {content}
          </motion.li>
        );
      })}
    </ol>
  );
}
