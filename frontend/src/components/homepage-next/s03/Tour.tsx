'use client';

/**
 * The guided demonstration engine and its slim control bar. The tour plays once per visit when the stage is at least
 * half visible (never under reduced motion, never automatically on phones), drives the real components through BEATS,
 * and hands over the moment the visitor does anything: a click, a tap or a key anywhere in S03 stops it for good.
 * It pauses while the page is hidden or the stage is out of view and resumes from the start of the same beat.
 */
import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject } from 'react';
import { BEATS } from './tourBeats';
import type { Action, Chapter } from './state';
import s from './S03.module.css';

export type TourStatus = 'idle' | 'playing' | 'paused' | 'done' | 'interrupted';

export function useTour(root: RefObject<HTMLElement | null>, stage: RefObject<HTMLElement | null>, dispatch: Dispatch<Action>, autoplay: boolean) {
  const [status, setStatus] = useState<TourStatus>('idle');
  const [beat, setBeat] = useState(0);
  const [played, setPlayed] = useState(false);
  const [run, setRun] = useState(0); // bumps on every (re)start of a beat, so progress restarts with it
  const timers = useRef<number[]>([]);
  const live = useRef({ status: 'idle' as TourStatus, beat: 0, visible: false });

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
    (i: number) => {
      clear();
      if (i >= BEATS.length) return setLive('done', BEATS.length - 1);
      setLive('playing', i);
      if (i === 0) setPlayed(true);
      setRun((r) => r + 1);
      for (const step of BEATS[i].steps) timers.current.push(window.setTimeout(() => step.actions.forEach(dispatch), step.at));
      timers.current.push(window.setTimeout(() => playBeat(i + 1), BEATS[i].dur));
    },
    [dispatch],
  );

  const start = useCallback(() => playBeat(0), [playBeat]);
  const stop = useCallback((why: 'done' | 'interrupted') => {
    const st = live.current.status;
    // input before the tour ever started also counts: a visitor who has begun exploring is never taken over later
    if (st !== 'playing' && st !== 'paused' && !(st === 'idle' && why === 'interrupted')) return;
    clear();
    setLive(why);
  }, []);

  // autoplay once, when the stage is at least half visible; pause when it leaves view
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        live.current.visible = e.intersectionRatio >= 0.5;
        const st = live.current.status;
        if (live.current.visible && st === 'idle' && autoplay) playBeat(0);
        else if (live.current.visible && st === 'paused') playBeat(live.current.beat);
        else if (e.intersectionRatio < 0.2 && st === 'playing') {
          clear();
          setLive('paused');
        }
      },
      { threshold: [0, 0.2, 0.5] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [stage, autoplay, playBeat]);

  // a hidden page never advances the tour
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && live.current.status === 'playing') {
        clear();
        setLive('paused');
      } else if (!document.hidden && live.current.status === 'paused' && live.current.visible) playBeat(live.current.beat);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [playBeat]);

  // any visitor input inside S03 (other than the tour's own controls) makes manual state authoritative
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onInput = (ev: Event) => {
      if ((ev.target as HTMLElement | null)?.closest?.('[data-tour-ctl]')) return;
      if (ev instanceof KeyboardEvent && (ev.key === 'Tab' || ev.key === 'Shift')) return;
      stop('interrupted');
    };
    el.addEventListener('pointerdown', onInput, true);
    el.addEventListener('keydown', onInput, true);
    return () => {
      el.removeEventListener('pointerdown', onInput, true);
      el.removeEventListener('keydown', onInput, true);
    };
  }, [root, stop]);

  useEffect(() => () => clear(), []);

  return { status, beat, run, played, start, skip: () => stop('done') };
}

const REST: Record<Chapter, string> = {
  search: 'Pick what to fix: your website, search, AI answers, authority or local.',
  growth: 'Pick a job: launch, search ads, social ads or conversions.',
};

export function TourBar({
  tour,
  view,
}: {
  tour: { status: TourStatus; beat: number; run: number; played: boolean; start: () => void; skip: () => void };
  view: Chapter;
}) {
  const active = tour.status === 'playing' || tour.status === 'paused';
  const b = BEATS[tour.beat];
  return (
    <div className={s.tourBar} data-status={tour.status}>
      {active ? (
        <>
          <span className={s.tourSteps} aria-hidden="true">
            {BEATS.map((x, i) => (
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
          <span className={s.tourCaption}>
            {tour.status === 'done' && <em data-stage="Yours">Your turn</em>}
            <span key={view}>{tour.status === 'done' ? 'Explore any part yourself.' : REST[view]}</span>
          </span>
          <button type="button" className={s.tourBtn} data-tour-ctl="" onClick={tour.start}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M5 3.5v9l7-4.5z" />
            </svg>
            {tour.played ? 'Replay' : 'Watch Xroga work'}
          </button>
        </>
      )}
    </div>
  );
}
