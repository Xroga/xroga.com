'use client';

/**
 * The Xroga card: the one place Xroga speaks in a scene. It changes with the phase:
 * ready to test → testing → the platform finding (with production progress) → the owner handoff.
 * The handoff separates what Xroga prepared from what stays with the owner, and its action goes to the real
 * release workspace (/dashboard/publish, or sign-up when signed out).
 */
import { ArcsetIcon } from '../apps/Arcset';
import { FernwayIcon } from '../apps/Fernway';
import { LensIcon } from '../apps/MerchantLens';
import { STORY, phaseReached, type Dest, type Phase } from '../publish';
import { Handoff } from './Handoff';
import s from './Stages.module.css';

const INVITE: Record<Dest, string> = {
  ios: 'Tap the check on set 3 yourself, or watch Xroga do it.',
  android: 'Tap Save offline yourself, or watch Xroga do it.',
  chrome: 'Click the MerchantLens button yourself, or watch Xroga do it.',
};

const JOURNEY: Record<Dest, string[]> = {
  ios: ['Your iPhone app', 'Xroga tests it', 'App Store listing', 'Your review'],
  android: ['Your Android app', 'Xroga tests it', 'Google Play listing', 'Your review'],
  chrome: ['Your extension', 'Xroga checks access', 'Chrome Web Store listing', 'Your review'],
};
const step = (p: Phase) => (p === 'idle' || p === 'use' ? 0 : p === 'inspect' ? 1 : p === 'ready' ? 3 : 2);

export function Xcard({ dest, phase, href, progress, journey = false }: { dest: Dest; phase: Phase; href: string; progress?: string; journey?: boolean }) {
  const S = STORY[dest];
  const state = phase === 'ready' ? 'owner' : phaseReached(phase, 'finding') ? 'finding' : phase === 'idle' ? 'idle' : 'testing';
  if (state === 'owner') {
    const Icon = dest === 'ios' ? ArcsetIcon : dest === 'android' ? FernwayIcon : LensIcon;
    return <Handoff dest={dest} href={href} product={<Icon size={44} />} />;
  }
  return (
    <div className={s.xcard} data-state={state} data-journey={journey || undefined} aria-live="polite">
      <span className={s.xKicker}>
        <i aria-hidden="true" />
        {state === 'finding' ? S.finding.kicker : state === 'testing' ? 'Xroga · testing in preview' : 'Xroga · ready'}
      </span>
      {state === 'finding' ? (
        <>
          <b className={s.xTitle}>{S.finding.title}</b>
          <span className={s.xDetail}>{S.finding.detail}</span>
          <span className={s.xProgress} data-on={!!progress || undefined}>
            {progress ?? S.say[phase]}
          </span>
        </>
      ) : (
        <>
          <b className={s.xTitle}>{state === 'idle' ? S.say.idle : S.say[phase]}</b>
          <span className={s.xDetail}>{state === 'idle' ? INVITE[dest] : 'Illustrative test of the product’s own behavior.'}</span>
        </>
      )}
      {journey && (
        <ol className={s.journey} aria-label="Where this is going">
          {JOURNEY[dest].map((label, i) => (
            <li key={label} data-state={i < step(phase) ? 'done' : i === step(phase) ? 'now' : 'next'}>
              {label}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
