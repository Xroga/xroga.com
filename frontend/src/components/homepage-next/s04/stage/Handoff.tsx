'use client';

/**
 * The release handoff: the culmination of a store's scene.
 * One headline sentence (the product is ready for the owner's review), what Xroga prepared, the owner's next steps,
 * where the release continues (App Store Connect / Play Console / developer dashboard, then the store's own review)
 * and one action into the real release workspace (/dashboard/publish, or sign-up when signed out).
 * Nothing here says submitted, approved or live.
 */
import Link from 'next/link';
import { STORY, type Dest } from '../publish';
import s from './Stages.module.css';

const CONTINUES: Record<Dest, { place: string; then: string }> = {
  ios: { place: 'App Store Connect', then: 'Apple reviews it before release' },
  android: { place: 'Play Console', then: 'Google reviews it before release' },
  chrome: { place: 'Chrome developer dashboard', then: 'Google reviews it before anyone can install it' },
};

export function Handoff({ dest, href, product }: { dest: Dest; href: string; product: React.ReactNode }) {
  const S = STORY[dest];
  const H = S.handoff;
  const C = CONTINUES[dest];
  return (
    <div className={s.handoffWrap}>
      <div className={s.handoff} data-dest={dest} aria-live="polite">
        <div className={s.hoTop}>
          <span className={s.hoIcon}>{product}</span>
          <span className={s.hoTitle}>
            <small>
              {H.title} · v{S.version}
            </small>
            <b>{H.headline}</b>
          </span>
        </div>
        <div className={s.hoPrepared}>
          <span className={s.hoLabel}>Prepared with Xroga</span>
          <ul className={s.hoChips}>
            {H.prepared.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
        <div className={s.hoYours}>
          <span className={s.hoLabel}>Your next steps</span>
          <ol className={s.hoSteps}>
            {H.yours.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
        </div>
        <div className={s.hoFoot}>
          <span className={s.hoDest}>
            <i aria-hidden="true">
              <svg viewBox="0 0 16 16" width="14" height="14">
                <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </i>
            <span>
              Continues in <b>{C.place}</b>
              <small>{C.then}</small>
            </span>
          </span>
          <Link href={href} className={s.hoCta}>
            {H.cta}
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
