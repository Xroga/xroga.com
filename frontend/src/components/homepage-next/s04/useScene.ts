'use client';

/**
 * The S04 scene clock: one list of timers per scenario, pausable and seekable.
 * - plays once per session when the theater is first seen (armed), and again when a store is chosen or Replay is used;
 * - pauses when the theater leaves the viewport (timers stop; `hold` lets CSS motion pause too) and resumes after;
 * - seek() jumps to a beat and holds it; reduced motion always shows the settled scene;
 * - review hook (development and Vercel previews only): ?s04Dest=…&s04Beat=… holds a beat.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { SCENES, beatIndex, beatOf, lastBeat, type Dest } from './publish';

/** the product reacts this long after the use beat begins (the press lands first) */
export const TAP_DELAY = 360;

export function useScene(theater: RefObject<HTMLElement | null>) {
  const [dest, setDest] = useState<Dest>('ios');
  const [beat, setBeat] = useState<string>(lastBeat('ios'));
  const [playing, setPlaying] = useState(false);
  const [acted, setActed] = useState(true);
  const [hold, setHold] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [armed, setArmed] = useState(false);

  const r = useRef({ dest, playing, armed, reduced });
  r.current = { dest, playing, armed, reduced };
  const timers = useRef<number[]>([]);
  const pos = useRef(0);
  const startedAt = useRef(0);
  const visible = useRef(false);
  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  const schedule = useCallback((d: Dest) => {
    clear();
    startedAt.current = performance.now();
    const from = pos.current;
    const S = SCENES[d];
    const useBeat = S.beats.find((b) => b.phase === 'use')!;
    const events: { at: number; run: () => void }[] = [
      ...S.beats.map((b) => ({ at: b.at, run: () => setBeat(b.id) })),
      { at: useBeat.at + TAP_DELAY, run: () => setActed(true) },
      { at: S.end, run: () => setPlaying(false) },
    ];
    for (const e of events) if (e.at > from) timers.current.push(window.setTimeout(e.run, e.at - from));
  }, []);

  const play = useCallback(
    (d: Dest, from = 'idle') => {
      clear();
      const b = beatOf(d, from);
      pos.current = b.at;
      setDest(d);
      setBeat(b.id);
      setActed(false);
      setArmed(false);
      setPlaying(true);
      setHold(!visible.current);
      if (visible.current) schedule(d);
    },
    [schedule],
  );

  const seek = useCallback((d: Dest, id: string) => {
    clear();
    setDest(d);
    setArmed(false);
    setPlaying(false);
    setHold(false);
    setBeat(id);
    setActed(beatIndex(d, id) >= SCENES[d].beats.findIndex((b) => b.phase === 'use'));
  }, []);

  useEffect(() => () => clear(), []);

  // reduced motion: read after mount, so the first client render matches the server's settled scene
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => {
      setReduced(mq.matches);
      if (mq.matches) seek(r.current.dest, lastBeat(r.current.dest));
    };
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [seek]);

  // first visit: arm the scene (it plays when seen); review hook in previews
  useEffect(() => {
    const preview = process.env.NODE_ENV !== 'production' || (!!process.env.NEXT_PUBLIC_VERCEL_ENV && process.env.NEXT_PUBLIC_VERCEL_ENV !== 'production');
    if (preview) {
      const q = new URLSearchParams(window.location.search);
      const qd = q.get('s04Dest');
      const d: Dest = qd === 'android' || qd === 'chrome' ? qd : 'ios';
      const qb = q.get('s04Beat');
      if (qd || qb) {
        seek(d, qb && beatIndex(d, qb) >= 0 ? qb : lastBeat(d));
        return;
      }
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem('s04-v10-seen') === '1';
    } catch {}
    if (seen) return;
    setBeat('idle');
    setActed(false);
    setArmed(true);
  }, [seek]);

  // visibility: start when first seen, pause offscreen, resume on return
  useEffect(() => {
    const el = theater.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        visible.current = e.isIntersecting;
        const c = r.current;
        if (e.isIntersecting) {
          if (c.armed) {
            try {
              sessionStorage.setItem('s04-v10-seen', '1');
            } catch {}
            play(c.dest);
          } else if (c.playing && timers.current.length === 0) {
            setHold(false);
            schedule(c.dest);
          }
        } else if (c.playing) {
          pos.current += performance.now() - startedAt.current;
          clear();
          setHold(true);
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [theater, play, schedule]);

  const choose = (d: Dest) => {
    if (r.current.reduced) seek(d, lastBeat(d));
    else play(d);
  };
  const replay = () => (r.current.reduced ? seek(r.current.dest, lastBeat(r.current.dest)) : play(r.current.dest));
  /** the visitor uses the product themselves: the scene plays from their action */
  const act = () => {
    const d = r.current.dest;
    if (r.current.reduced) {
      seek(d, lastBeat(d));
      return;
    }
    if (r.current.playing) return;
    play(d, SCENES[d].beats.find((b) => b.phase === 'use')!.id);
  };

  return { dest, beat, phase: beatOf(dest, beat).phase, playing, acted, hold, reduced, choose, replay, seek: (id: string) => seek(r.current.dest, id), act };
}
