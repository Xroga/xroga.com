'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Check, Minus } from 'lucide-react';
import { OnboardingCard } from './OnboardingCard';
import { ONBOARDING_ARTWORK } from './artwork';
import {
  preparingDescription,
  PROJECT_TYPE_LABELS,
  type OnboardingState,
} from '@/lib/onboarding';

type RowState = 'done' | 'active' | 'waiting' | 'skipped';

function RowIcon({ state }: { state: RowState }) {
  if (state === 'done') return <Check className="h-3.5 w-3.5" aria-hidden="true" />;
  // Skipped is a dash, not a cross. Nothing went wrong — a choice was made, and
  // dressing it as a failure punishes the reader for taking the offer.
  if (state === 'skipped') return <Minus className="h-3.5 w-3.5" aria-hidden="true" />;
  if (state === 'active') return <span className="xv-onb-dot" aria-hidden="true" />;
  return <span className="xv-onb-ring" aria-hidden="true" />;
}

/**
 * The last stage, which becomes the finish rather than handing off to a fifth card.
 *
 * It waits on the work the caller is actually doing. There is no padded timer: when
 * `ready` flips the summary appears, so a fast account is finished fast.
 */
export function WorkspacePreparationCard({
  state,
  ready,
  onStart,
}: {
  state: OnboardingState;
  ready: boolean;
  onStart: () => void;
}) {
  const reduced = useReducedMotion();
  // Rows tick over as the real work lands; this only paces the two that have no
  // observable signal of their own, so the list never sits still while it waits.
  const [tick, setTick] = useState(0);
  const started = useRef(Date.now());

  useEffect(() => {
    if (ready) return;
    const id = setInterval(() => {
      setTick(Math.min(2, Math.floor((Date.now() - started.current) / 550)));
    }, 200);
    return () => clearInterval(id);
  }, [ready]);

  const githubRow: RowState = state.githubConnected ? 'done' : state.githubSkipped ? 'skipped' : 'skipped';
  const vercelRow: RowState = state.vercelConnected ? 'done' : state.vercelSkipped ? 'skipped' : 'skipped';

  const rows: Array<{ key: string; label: string; state: RowState }> = [
    { key: 'project', label: "Understanding what you're building", state: 'done' },
    {
      key: 'github',
      label: state.githubConnected ? 'GitHub connected' : 'GitHub skipped',
      state: githubRow,
    },
    {
      key: 'vercel',
      label: state.vercelConnected ? 'Vercel connected' : 'Vercel skipped',
      state: vercelRow,
    },
    {
      key: 'workspace',
      label: 'Preparing your workspace',
      state: ready ? 'done' : tick >= 1 ? 'active' : 'waiting',
    },
    {
      key: 'ready',
      label: 'Getting Xroga ready',
      state: ready ? 'done' : tick >= 2 ? 'active' : 'waiting',
    },
  ];

  return (
    <OnboardingCard
      artwork={ONBOARDING_ARTWORK.preparing}
      headline={ready ? "You're ready to build." : 'Preparing Xroga for you'}
      description={ready ? 'Your Xroga workspace is prepared.' : preparingDescription(state.projectType)}
      footer={
        ready ? (
          <div className="xv-onb-actions">
            <button type="button" onClick={onStart} className="xv-onb-cta" autoFocus>
              Start building
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : null
      }
    >
      {ready ? (
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduced ? { duration: 0.1 } : { type: 'spring', stiffness: 300, damping: 30 }}
          className="xv-onb-summary"
        >
          {state.projectType ? (
            <span className="xv-onb-chip">{PROJECT_TYPE_LABELS[state.projectType]}</span>
          ) : null}
          <span className="xv-onb-chip">
            {state.githubConnected ? 'GitHub connected' : 'GitHub skipped'}
          </span>
          <span className="xv-onb-chip">
            {state.vercelConnected ? 'Vercel connected' : 'Vercel skipped'}
          </span>
        </motion.div>
      ) : (
        // One region, polite: the rows change together, and announcing each line as
        // it ticks would talk over the reader for the whole wait.
        <ul className="xv-onb-steps" aria-live="polite" aria-busy={!ready}>
          {rows.map((row) => (
            <li key={row.key} className={`xv-onb-step is-${row.state}`}>
              <span className="xv-onb-step__icon">
                <RowIcon state={row.state} />
              </span>
              <span className="xv-onb-step__label">{row.label}</span>
            </li>
          ))}
        </ul>
      )}
    </OnboardingCard>
  );
}
