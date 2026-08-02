'use client';

import { useEffect, useRef, useState } from 'react';
import { ACTIVITY_LINES, BUILD_STAGES } from '@/lib/gameCockpitContent';
import { HudIcon } from './HudIcons';

/**
 * The build pipeline, in two presentations from one component.
 *
 * `variant="log"` is the cockpit's compact activity list; `variant="steps"` is the
 * numbered pipeline in its own section. They share this file because they share the
 * stage data and the progression rule — two components would drift.
 *
 * The progression is honest about what it is. It advances on a fixed interval and
 * stops at the last stage; it is not a live build, and the panel says so in text
 * that is read out rather than hidden in a tooltip. There is no elapsed timer and
 * no completion-time claim, because the page must not imply a duration Xroga has
 * not measured. The clock labels are fixed strings, not `Date.now()`, so a
 * screenshot is deterministic and there is no server/client time mismatch.
 */
export function BuildActivity({
  variant = 'log',
  active = true,
  onClose,
}: {
  variant?: 'log' | 'steps';
  active?: boolean;
  onClose?: () => void;
}) {
  const total = variant === 'log' ? ACTIVITY_LINES.length : BUILD_STAGES.length;
  const [done, setDone] = useState(total);
  const nodeRef = useRef<HTMLElement>(null);

  /**
   * Only animate once the panel is on screen, and stop when it leaves — an
   * interval that runs behind the fold is work nobody sees. Reduced motion skips
   * the sequence entirely and shows the finished state, which is the useful one.
   */
  useEffect(() => {
    if (!active) return;
    const node = nodeRef.current;
    if (!node) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      setDone(0);
      timer = setInterval(() => {
        setDone((d) => {
          if (d >= total) {
            if (timer) clearInterval(timer);
            timer = null;
            return total;
          }
          return d + 1;
        });
      }, 900);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    const observer = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? start() : stop()),
      { threshold: 0.35 }
    );
    observer.observe(node);
    return () => {
      stop();
      observer.disconnect();
    };
  }, [active, total]);

  const percent = Math.round((done / total) * 100);

  if (variant === 'steps') {
    return (
      <section className="xv-gc-panel xv-gc-steps" aria-labelledby="gc-steps-title" ref={nodeRef}>
        <header className="xv-gc-panel__head">
          <h2 className="xv-gc-panel__title" id="gc-steps-title">
            <span className="xv-gc-panel__index">3.</span> Watch Xroga build
          </h2>
        </header>

        <ol className="xv-gc-steps__list">
          {BUILD_STAGES.map((stage, index) => {
            const state = index < done ? 'done' : index === done ? 'active' : 'idle';
            return (
              <li key={stage.id} className="xv-gc-steps__item" data-state={state}>
                <span className="xv-gc-steps__num" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="xv-gc-steps__label">{stage.label}</span>
                <span className="xv-gc-steps__mark" aria-hidden="true">
                  {state === 'done' ? <HudIcon name="check" size={13} /> : null}
                </span>
              </li>
            );
          })}
        </ol>

        <p className="xv-gc-note">
          Interface demonstration of the build sequence. Xroga reports evidence from a real build, or the exact
          blocker — it does not promise a completion time.
        </p>
      </section>
    );
  }

  return (
    <section className="xv-gc-panel xv-gc-activity" aria-labelledby="gc-activity-title" ref={nodeRef}>
      <header className="xv-gc-panel__head">
        <h3 className="xv-gc-panel__title" id="gc-activity-title">
          Build activity
        </h3>
        {onClose && (
          <button type="button" className="xv-gc-iconbtn" onClick={onClose} aria-label="Hide build activity">
            <HudIcon name="close" size={13} />
          </button>
        )}
      </header>

      <ol className="xv-gc-activity__list">
        {ACTIVITY_LINES.map((line, index) => (
          <li key={line} className="xv-gc-activity__row" data-done={index < done ? 'true' : 'false'}>
            <span className="xv-gc-activity__stamp" aria-hidden="true">
              {`12:0${index}`}
            </span>
            <span className="xv-gc-activity__text">{line}</span>
            <span className="xv-gc-activity__mark" aria-hidden="true">
              {index < done ? <HudIcon name="check" size={12} /> : null}
            </span>
          </li>
        ))}
      </ol>

      <div
        className="xv-gc-activity__bar"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Build sequence demonstration"
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <p className="xv-gc-activity__pct">
        <span className="xv-gc-sr">Demonstration progress </span>
        {percent}%
      </p>
    </section>
  );
}
