'use client';

/**
 * The guided demonstration engine and the stage's top row. The tour plays once per visit when the stage is at least half
 * visible and motion is allowed: the full sequence on wider screens, a shorter one on phones. It drives the real
 * components through the beats and hands over the moment the visitor does anything: a click, a tap or a key anywhere
 * in S03 stops it for good (a bare click too, as some assistive technologies send). It pauses while the page is hidden or the stage is out of view and resumes where it
 * stopped. There is no Play or Replay control: after the tour, the visitor explores.
 */
import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject } from 'react';
import { COPY } from './data';
import type { Action, Chapter } from './state';
import type { Beat } from './tourBeats';
import s from './S03.module.css';

export type TourStatus = 'idle' | 'playing' | 'paused' | 'done' | 'interrupted';
const SEEN = 's03-tour-seen';

const seenThisVisit = () => {
  try {
    return window.sessionStorage.getItem(SEEN) === '1';
  } catch {
    return false;
  }
};
const markSeen = () => {
  try {
    window.sessionStorage.setItem(SEEN, '1');
  } catch {
    /* storage unavailable: the in-memory status still prevents a second run */
  }
};

export function useTour(root: RefObject<HTMLElement | null>, stage: RefObject<HTMLElement | null>, dispatch: Dispatch<Action>, beats: Beat[] | null) {
  const [status, setStatus] = useState<TourStatus>('idle');
  const [beat, setBeat] = useState(0);
  const [run, setRun] = useState(0); // bumps when a beat starts from its beginning, so progress restarts with it
  const timers = useRef<number[]>([]);
  const live = useRef({ status: 'idle' as TourStatus, beat: 0, visible: false, started: 0, elapsed: 0 });
  const list = useRef<Beat[]>(beats ?? []);
  list.current = beats ?? list.current;

  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  const setLive = (st: TourStatus, b = live.current.beat) => {
    live.current.status = st;
    live.current.beat = b;
    setStatus(st);
    setBeat(b);
  };

  const playBeat = useCallback(
    (i: number, from = 0) => {
      clear();
      const B = list.current;
      if (i >= B.length) return setLive('done', B.length - 1);
      setLive('playing', i);
      if (from === 0) setRun((r) => r + 1);
      live.current.started = performance.now() - from;
      for (const step of B[i].steps)
        if (from === 0 || step.at > from) timers.current.push(window.setTimeout(() => step.actions.forEach(dispatch), step.at - from));
      timers.current.push(window.setTimeout(() => playBeat(i + 1), B[i].dur - from));
    },
    [dispatch],
  );
  const pause = useCallback(() => {
    live.current.elapsed = Math.min(performance.now() - live.current.started, list.current[live.current.beat].dur - 1);
    clear();
    setLive('paused');
  }, []);
  const resume = useCallback(() => playBeat(live.current.beat, live.current.elapsed), [playBeat]);

  const stop = useCallback((why: 'done' | 'interrupted') => {
    const st = live.current.status;
    // input before the tour ever started also counts: a visitor who has begun exploring is never taken over later
    if (st !== 'playing' && st !== 'paused' && !(st === 'idle' && why === 'interrupted')) return;
    clear();
    setLive(why);
  }, []);

  // play once per visit, when the stage is at least half visible; pause when it leaves view
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        live.current.visible = e.intersectionRatio >= 0.5;
        const st = live.current.status;
        if (live.current.visible && st === 'idle' && beats && !seenThisVisit()) {
          markSeen();
          playBeat(0);
        } else if (live.current.visible && st === 'paused') resume();
        else if (e.intersectionRatio < 0.2 && st === 'playing') pause();
      },
      { threshold: [0, 0.2, 0.5] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [stage, beats, playBeat, pause, resume]);

  // a hidden page never advances the tour
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && live.current.status === 'playing') pause();
      else if (!document.hidden && live.current.status === 'paused' && live.current.visible) resume();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [pause, resume]);

  // any visitor input inside S03 (other than the tour's own controls) makes manual state authoritative
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onInput = (ev: Event) => {
      if ((ev.target as HTMLElement | null)?.closest?.('[data-tour-ctl]')) return;
      if (ev instanceof KeyboardEvent && (ev.key === 'Tab' || ev.key === 'Shift')) return;
      stop('interrupted');
    };
    // click as well: some assistive technologies activate controls with a bare click and no pointer or key event
    const kinds = ['pointerdown', 'keydown', 'click'] as const;
    kinds.forEach((k) => el.addEventListener(k, onInput, true));
    return () => kinds.forEach((k) => el.removeEventListener(k, onInput, true));
  }, [root, stop]);

  useEffect(() => () => clear(), []);

  return { status, beat, run, beats: list.current, skip: () => stop('done') };
}

/**
 * The stage's top row. While the tour plays: progress, the stage of the work (Found, Compared, Prepared, Needs
 * approval), one caption and Skip. Otherwise: which example this is, and an understated note about the walkthrough.
 */
export function StageHead({
  tour,
  view,
  about,
  onAbout,
}: {
  tour: { status: TourStatus; beat: number; run: number; beats: Beat[]; skip: () => void };
  view: Chapter;
  about: boolean;
  onAbout: () => void;
}) {
  const active = tour.status === 'playing' || tour.status === 'paused';
  const b = tour.beats[tour.beat];
  return (
    <div className={s.stageHead} data-status={tour.status}>
      {active && b ? (
        <>
          <span className={s.tourSteps} aria-hidden="true">
            {tour.beats.map((x, i) => (
              <i
                key={i}
                data-view={x.view}
                data-done={i < tour.beat || undefined}
                data-now={i === tour.beat || undefined}
                style={i === tour.beat ? { ['--dur' as string]: `${x.dur}ms` } : undefined}
              >
                {i === tour.beat && <b key={tour.run} data-paused={tour.status === 'paused' || undefined} />}
              </i>
            ))}
          </span>
          <span className={s.tourCaption} aria-live="polite">
            <em data-stage={b.stage}>{b.stage}</em>
            <span key={tour.beat}>{b.caption}</span>
          </span>
          <button type="button" className={s.tourBtn} data-tour-ctl="" onClick={tour.skip}>
            Skip
          </button>
        </>
      ) : (
        <>
          <span className={s.scenarioName}>
            {COPY[view].scenario}
            {tour.status === 'done' && <span className={s.yourTurn}> · Your turn: explore any part</span>}
          </span>
          <button type="button" className={s.aboutBtn} aria-expanded={about} aria-controls="s03-about" onClick={onAbout}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" r="6.25" />
              <path d="M8 7.2v3.6M8 5.1v.1" />
            </svg>
            {COPY.disclosure}
          </button>
        </>
      )}
    </div>
  );
}
