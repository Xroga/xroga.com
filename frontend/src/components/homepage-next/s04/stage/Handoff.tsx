'use client';

/**
 * The destination handoff: the release Xroga prepared for one store, what is done, what stays with the owner, where it
 * goes next, and one action that opens the real release workspace (/dashboard/publish, or sign-up when signed out).
 * Nothing here says submitted, approved or live; the next line names the store's own review.
 */
import Link from 'next/link';
import { STORY, type Dest } from '../publish';
import s from './Stages.module.css';

const STORE_HOME: Record<Dest, string> = { ios: 'App Store Connect', android: 'Play Console', chrome: 'Developer Dashboard' };
const UNIT: Record<Dest, string> = { ios: 'iPhone app', android: 'Android app', chrome: 'Browser extension' };

export function Handoff({ dest, href, product, compact = false }: { dest: Dest; href: string; product: React.ReactNode; compact?: boolean }) {
  const S = STORY[dest];
  const H = S.handoff;
  return (
    <div className={s.handoff} data-compact={compact || undefined} aria-live="polite">
      <div className={s.hoHead}>
        <span className={s.hoIcon}>{product}</span>
        <span className={s.hoTitle}>
          <b>{H.title}</b>
          <small>
            {S.product} · {UNIT[dest]} · Version {S.version}
          </small>
        </span>
      </div>
      <div className={s.hoCols}>
        <ul className={s.hoDone} aria-label="Prepared by Xroga">
          {H.prepared.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <ul className={s.hoYours} aria-label="Your steps">
          {H.yours.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
      <div className={s.hoFoot}>
        <span className={s.hoNext}>
          <i aria-hidden="true" />
          <span>
            <b>{STORE_HOME[dest]}</b> {H.next.replace(/^Next: /, '· ')}
          </span>
        </span>
        <Link href={href} className={s.hoCta}>
          {H.cta}
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </div>
  );
}
