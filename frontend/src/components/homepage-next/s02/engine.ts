/**
 * S02 demo engine: a pure reducer over (track, step). Timers live in the hook; every timer carries the
 * generation it was scheduled for, and a stale generation is ignored, so a timer from an old scene can never
 * move a newer one. Manual choices win over autoplay.
 */
import { AUTO_ORDER, modeOf, stepDurations, type Mode, type TrackId } from './script';

export interface DemoState {
  track: TrackId;
  step: number;
  /** Bumped on every scene change, replay or seek; timers compare against it. */
  gen: number;
  /** The visitor pressed pause (or reduced motion: never plays). */
  paused: boolean;
  /** True until the visitor chooses a mode, scene or employee; then autoplay stays on their choice. */
  auto: boolean;
  /** The last step's hold finished and nothing follows (a manual choice holds its result). */
  ended: boolean;
  /** The last track used in each mode, so switching modes returns to it. */
  lastByMode: Record<Mode, TrackId>;
}

export type DemoAction =
  | { type: 'advance'; gen: number }
  | { type: 'select'; track: TrackId }
  | { type: 'mode'; mode: Mode }
  | { type: 'pause' }
  | { type: 'play' }
  | { type: 'replay' }
  | { type: 'seek'; step: number }
  | { type: 'goto'; track: TrackId; step: number };

export const initialState = (reduced = false): DemoState => ({
  track: AUTO_ORDER[0],
  step: 0,
  gen: 0,
  paused: reduced,
  // nothing chains: the first mission plays once when the section is reached, then holds its result
  auto: false,
  ended: false,
  lastByMode: { browser: 'browser:bug', employees: 'emp:team' },
});

const start = (s: DemoState, track: TrackId, extra: Partial<DemoState> = {}): DemoState => ({
  ...s,
  track,
  step: 0,
  gen: s.gen + 1,
  ended: false,
  lastByMode: { ...s.lastByMode, [modeOf(track)]: track },
  ...extra,
});

export function demoReducer(s: DemoState, a: DemoAction): DemoState {
  switch (a.type) {
    case 'advance': {
      if (a.gen !== s.gen || s.paused || s.ended) return s; // stale or held timer
      const last = stepDurations(s.track).length - 1;
      if (s.step < last) return { ...s, step: s.step + 1, gen: s.gen + 1 };
      if (!s.auto) return { ...s, ended: true };
      const next = AUTO_ORDER[(AUTO_ORDER.indexOf(s.track) + 1) % AUTO_ORDER.length];
      return start(s, next);
    }
    case 'select':
      // a manual choice: play it from its first frame, then hold its result
      return start(s, a.track, { auto: false, paused: false });
    case 'mode':
      if (modeOf(s.track) === a.mode) return { ...s, auto: false };
      return start(s, s.lastByMode[a.mode], { auto: false, paused: false });
    case 'pause':
      return { ...s, paused: true };
    case 'play':
      if (s.ended) return start(s, s.track, { paused: false });
      return { ...s, paused: false };
    case 'replay':
      return start(s, s.track, { paused: false });
    case 'goto': {
      // a deliberate jump (back to the team, a phase on the scrubber): the complete state of that step, held
      const last = stepDurations(a.track).length - 1;
      const step = Math.max(0, Math.min(last, a.step));
      return { ...s, track: a.track, step, gen: s.gen + 1, paused: true, auto: false, ended: false, lastByMode: { ...s.lastByMode, [modeOf(a.track)]: a.track } };
    }
    case 'seek': {
      const last = stepDurations(s.track).length - 1;
      const step = Math.max(0, Math.min(last, a.step));
      return { ...s, step, gen: s.gen + 1, paused: true, auto: false, ended: false };
    }
  }
}

/** The total length of a track in ms (tests and timing logs). */
export const trackLength = (t: TrackId) => stepDurations(t).reduce((a, b) => a + b, 0);
