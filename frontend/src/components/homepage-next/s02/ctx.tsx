'use client';

/**
 * What every app on the S02 computer reads: which steps have happened, which one is happening now, and typed
 * fields. Apps never keep their own clocks; their whole visual state is a function of (track, step).
 */
import type { ReactNode } from 'react';
import { Typed } from './motion';
import type { Step } from './script';

export interface Ctx {
  steps: Step[];
  step: number;
  /** The step has happened (current or earlier). */
  at: (id: string) => boolean;
  /** The step is the current one. */
  now: (id: string) => boolean;
  /** The scene has reached its settled result. */
  done: boolean;
  running: boolean;
  reduced: boolean;
  accent: string;
  /** Typed text for a step: a placeholder before it, characters during it, the full text after it. */
  field: (id: string, placeholder?: ReactNode) => ReactNode;
}

export function makeCtx(steps: Step[], step: number, running: boolean, reduced: boolean, accent: string): Ctx {
  const index = (id: string) => steps.findIndex((x) => x.id === id);
  const at = (id: string) => {
    const i = index(id);
    return i >= 0 && i <= step;
  };
  const now = (id: string) => index(id) === step;
  return {
    steps,
    step,
    at,
    now,
    done: step >= steps.length - 1,
    running,
    reduced,
    accent,
    field: (id, placeholder = '') => {
      const st = steps[index(id)];
      if (!st?.typed) return placeholder;
      if (!at(id)) return placeholder;
      return <Typed text={st.typed} active={now(id)} done={!now(id)} running={running} reduced={reduced} ms={st.ms} />;
    },
  };
}
