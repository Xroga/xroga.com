/**
 * Browser mission engine (kept from V7/V9): a pure reducer over (track, step). Timers live in the hook; every timer
 * carries the generation it was scheduled for, and a stale generation is ignored, so a timer from an old scene can
 * never move a newer one. A mission plays once and holds its result; nothing chains to another mission.
 */
import { FIRST, stepDurations, type TrackId } from './script';

export interface DemoState {
  track: TrackId;
  step: number;
  /** Bumped on every scene change, replay or seek; timers compare against it. */
  gen: number;
  paused: boolean;
  /** The last step's hold finished: the result stays on screen until the visitor chooses again. */
  ended: boolean;
}

export type DemoAction =
  | { type: 'advance'; gen: number }
  | { type: 'select'; track: TrackId }
  | { type: 'replay' }
  | { type: 'pause' }
  | { type: 'play' }
  | { type: 'seek'; step: number };

export const initialState = (): DemoState => ({ track: FIRST, step: 0, gen: 0, paused: false, ended: false });

const start = (s: DemoState, track: TrackId): DemoState => ({ ...s, track, step: 0, gen: s.gen + 1, ended: false, paused: false });

export function demoReducer(s: DemoState, a: DemoAction): DemoState {
  switch (a.type) {
    case 'advance': {
      if (a.gen !== s.gen || s.paused || s.ended) return s; // stale or held timer
      const last = stepDurations(s.track).length - 1;
      if (s.step < last) return { ...s, step: s.step + 1, gen: s.gen + 1 };
      return { ...s, ended: true };
    }
    case 'select':
      return start(s, a.track);
    case 'replay':
      return start(s, s.track);
    case 'pause':
      return { ...s, paused: true };
    case 'play':
      return s.ended ? start(s, s.track) : { ...s, paused: false };
    case 'seek': {
      const last = stepDurations(s.track).length - 1;
      return { ...s, step: Math.max(0, Math.min(last, a.step)), gen: s.gen + 1, paused: true, ended: false };
    }
  }
}

/** The browser phase the brief names: ready → working → result, or approval-pending when the result waits on you. */
export function browserPhase(s: DemoState, approval: boolean): 'ready' | 'working' | 'result' | 'approval-pending' {
  const last = stepDurations(s.track).length - 1;
  if (s.step >= last) return approval ? 'approval-pending' : 'result';
  return s.step === 0 ? 'ready' : 'working';
}
