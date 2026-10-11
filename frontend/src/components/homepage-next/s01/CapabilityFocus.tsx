'use client';
/**
 * Explore: the clicked card lifts out of the deck, travels to the centre, turns over and shows its full capabilities
 * on the reverse. It is the same physical card: the flying copy starts exactly over the source card (which hides while
 * it is lifted), its front is the card's own front scaled up, and its back is the Obsidian Titanium reverse laid out
 * for reading. Implemented as a card-shaped modal <dialog> (the page behind is inert, focus stays inside, Escape works),
 * animated with the Web Animations API from the source card's geometry. No side drawer.
 *
 * State machine: closed -> opening (lift, travel, turn) -> open (details readable, scroll inside) -> closing (turn back,
 * return to the deck) -> closed, then focus returns to the Explore button that opened it.
 *
 * "Try this request in Xroga" uses the product's existing hand-off (the same one as the S00 command bar): the example
 * request goes into localStorage under PENDING_PROMPT_KEY and the visitor lands in /workspace, or signs up first.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { PENDING_PROMPT_KEY } from '@/lib/constants';
import { createClient } from '@/lib/supabase/client';
import { submission } from '../phase1/commandLogic';
import { CAPABILITIES, STATUS_LABEL, SECTION, type CapabilityId } from './capabilities.data';
import { CapabilityCard, DeckPattern } from './CapabilityCard';
import f from './Focus.module.css';

export interface FocusRequest {
  id: CapabilityId;
  /** the Explore button that opened it: focus returns here */
  trigger: HTMLButtonElement;
  /** the card in the deck: the flight starts and ends on it */
  source: HTMLElement;
}

type Phase = 'closed' | 'opening' | 'open' | 'closing';

interface Geometry {
  tw: number;
  th: number;
  tx: number;
  ty: number;
  sw: number;
  sh: number;
}

const EASE = 'cubic-bezier(0.55, 0, 0.16, 1)';
export const FOCUS_OPEN_MS = 760;
export const FOCUS_CLOSE_MS = 620;

/** Target box: centred, clear of the site header on desktop, near full screen on phones. */
function targetBox(sw: number, sh: number): Geometry {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const phone = vw < 640;
  const top = phone ? 12 : 88;
  const bottom = phone ? 12 : 24;
  const th = Math.min(vh - top - bottom, phone ? 2000 : 820);
  const tw = phone ? vw - 24 : Math.min(640, vw - 48);
  return { tw, th, tx: (vw - tw) / 2, ty: top + (vh - top - bottom - th) / 2, sw, sh };
}

/** The transform that puts the flying card exactly over the source card. */
function fromSource(source: HTMLElement, g: Geometry) {
  const r = source.getBoundingClientRect();
  const s0 = g.sh / g.th;
  const dx = r.left + r.width / 2 - (g.tx + g.tw / 2);
  const dy = r.top + r.height / 2 - (g.ty + g.th / 2);
  return { dx, dy, s0 };
}

export function CapabilityFocus({ request, reduced, onClosed }: { request: FocusRequest | null; reduced: boolean; onClosed: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const flyRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>('closed');
  const [geo, setGeo] = useState<Geometry | null>(null);
  const [sending, setSending] = useState(false);
  const phaseRef = useRef<Phase>('closed');
  const router = useRouter();
  const cap = request ? CAPABILITIES.find((c) => c.id === request.id) ?? null : null;

  const setP = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  // open: measure, show the modal, hide the source card, fly and turn
  useLayoutEffect(() => {
    if (!request) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const g = targetBox(request.source.offsetWidth, request.source.offsetHeight);
    setGeo(g);
    if (!dialog.open) dialog.showModal();
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    request.source.style.visibility = 'hidden';
    setP('opening');
    return () => {
      root.style.overflow = prevOverflow;
      request.source.style.visibility = '';
    };
  }, [request]);

  // run the flight once the geometry has rendered
  useLayoutEffect(() => {
    if (!request || !geo || phaseRef.current !== 'opening') return;
    const fly = flyRef.current;
    if (!fly) return;
    const done = () => {
      setP('open');
      titleRef.current?.focus({ preventScroll: true });
    };
    if (reduced) {
      done();
      return;
    }
    const { dx, dy, s0 } = fromSource(request.source, geo);
    const anim = fly.animate(
      [
        { transform: `translate3d(${dx}px, ${dy}px, 0) scale(${s0}) rotateY(0deg)` },
        { transform: `translate3d(${dx * 0.35}px, ${dy * 0.35}px, 80px) scale(${(s0 + 1) / 2}) rotateY(90deg)`, offset: 0.52 },
        { transform: 'translate3d(0, 0, 0) scale(1) rotateY(180deg)' },
      ],
      { duration: FOCUS_OPEN_MS, easing: EASE, fill: 'both' },
    );
    anim.onfinish = () => {
      anim.commitStyles?.();
      anim.cancel();
      done();
    };
    return () => anim.cancel();
  }, [request, geo, reduced]);

  const finishClose = useCallback(() => {
    // put the card back in the deck before closing, so the browser can return focus to its Explore button
    if (request) request.source.style.visibility = '';
    document.documentElement.style.overflow = '';
    dialogRef.current?.close();
    request?.trigger.focus({ preventScroll: true });
    setP('closed');
    setGeo(null);
    onClosed();
  }, [onClosed, request]);

  const close = useCallback(() => {
    if (phaseRef.current !== 'open' || !request || !geo) return;
    setP('closing');
    const fly = flyRef.current;
    if (reduced || !fly) {
      finishClose();
      return;
    }
    const { dx, dy, s0 } = fromSource(request.source, geo);
    const anim = fly.animate(
      [
        { transform: 'translate3d(0, 0, 0) scale(1) rotateY(180deg)' },
        { transform: `translate3d(${dx * 0.35}px, ${dy * 0.35}px, 80px) scale(${(s0 + 1) / 2}) rotateY(90deg)`, offset: 0.48 },
        { transform: `translate3d(${dx}px, ${dy}px, 0) scale(${s0}) rotateY(0deg)` },
      ],
      { duration: FOCUS_CLOSE_MS, easing: EASE, fill: 'both' },
    );
    anim.onfinish = finishClose;
  }, [request, geo, reduced, finishClose]);

  // reset the reading position for each card
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [request?.id]);

  const tryRequest = () => {
    if (!cap || sending) return;
    setSending(true);
    const go = (signedIn: boolean) => {
      const { prompt, route } = submission(cap.example, signedIn);
      try {
        if (prompt) localStorage.setItem(PENDING_PROMPT_KEY, prompt);
      } catch {
        /* storage unavailable: the visitor still reaches the workspace */
      }
      dialogRef.current?.close();
      document.documentElement.style.overflow = '';
      router.push(route);
    };
    try {
      void createClient()
        .auth.getSession()
        .then(({ data }) => go(!!data.session))
        .catch(() => go(false));
    } catch {
      // no auth client available: the visitor still reaches sign-up with the request saved
      go(false);
    }
  };

  const front = geo && cap && (
    <div
      className={f.frontFace}
      style={{ width: (geo.sw * geo.th) / geo.sh, left: (geo.tw - (geo.sw * geo.th) / geo.sh) / 2 } as CSSProperties}
    >
      <div
        className={f.frontScale}
        style={{ width: geo.sw, height: geo.sh, transform: `scale(${geo.th / geo.sh})`, '--cw': `${geo.sw}px` } as CSSProperties}
      >
        <CapabilityCard cap={cap} step={4} expanded={false} onExplore={() => {}} passive flat />
      </div>
    </div>
  );

  return (
    <dialog
      ref={dialogRef}
      className={f.dialog}
      aria-labelledby="s01-focus-title"
      data-phase={phase}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className={f.dim} onClick={close} aria-hidden />
      {cap && geo && (
        <div className={f.stage} style={{ '--accent': cap.accent } as CSSProperties}>
          <div
            ref={flyRef}
            className={f.fly}
            data-reduced={reduced || undefined}
            style={{ left: geo.tx, top: geo.ty, width: geo.tw, height: geo.th } as CSSProperties}
          >
            {!reduced && front}
            <div className={f.back}>
              <DeckPattern className={f.pattern} />
              <span className={f.tracer} aria-hidden />
              <header className={f.head}>
                <div>
                  <span className={f.num}>{cap.number}</span>
                  <h2 id="s01-focus-title" ref={titleRef} tabIndex={-1} className={f.title}>
                    {cap.title}
                  </h2>
                </div>
                <button type="button" className={f.close} onClick={close} aria-label="Back to cards">
                  <ArrowLeft aria-hidden />
                  <span>Back to cards</span>
                </button>
              </header>
              <div ref={scrollRef} className={f.scroll} tabIndex={0} aria-label={`${cap.title} details`}>
                <p className={f.benefit}>{cap.benefit}</p>
                <ul className={f.includes} aria-label={`${cap.title} includes`}>
                  {cap.chips.map((chip) => (
                    <li key={chip}>{chip}</li>
                  ))}
                </ul>

                <div className={f.outcome}>
                  <small>Example outcome</small>
                  <p>{cap.outcome}</p>
                </div>

                <h3 className={f.sub}>How it works</h3>
                <ol className={f.how}>
                  {cap.how.map((beat, i) => (
                    <li key={beat}>
                      <i aria-hidden>{i + 1}</i>
                      {beat}
                    </li>
                  ))}
                </ol>

                <h3 className={f.sub}>{cap.reverseTitle}</h3>
                <div className={f.groups}>
                  {cap.groups.map((g) => (
                    <section key={g.label} className={f.group}>
                      <h4>{g.label}</h4>
                      <p>{g.text}</p>
                      <ul className={f.examples}>
                        {g.examples.map((e) => (
                          <li key={e}>{e}</li>
                        ))}
                      </ul>
                      {g.points.length > 0 && (
                        <ul className={f.points}>
                          {g.points.map((n) => (
                            <li key={n}>{cap.details[n]}</li>
                          ))}
                        </ul>
                      )}
                    </section>
                  ))}
                </div>

                <h3 className={f.sub}>Availability today</h3>
                <ul className={f.truth}>
                  {cap.truth.map((t) => (
                    <li key={t.text} data-status={t.status}>
                      <span className={f.status}>{STATUS_LABEL[t.status]}</span>
                      <span>{t.text}</span>
                    </li>
                  ))}
                </ul>

                <h3 className={f.sub}>Ask it like this</h3>
                <blockquote className={f.example}>{cap.example}</blockquote>
                <p className={f.fine}>{SECTION.note}</p>
              </div>
              <footer className={f.foot}>
                <button type="button" className={f.primary} onClick={tryRequest} disabled={sending}>
                  {sending ? 'Opening Xroga' : 'Try in Xroga'}
                  <ArrowRight aria-hidden />
                </button>
              </footer>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
