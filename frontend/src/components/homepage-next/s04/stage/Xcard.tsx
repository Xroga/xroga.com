'use client';

/**
 * The Xroga card: the one place Xroga speaks in a scene. It changes with the phase:
 * ready to test → testing → the platform finding (with production progress) → the owner handoff.
 * The handoff separates what Xroga prepared from what stays with the owner, and its action goes to the real
 * release workspace (/dashboard/publish, or sign-up when signed out).
 */
import Link from 'next/link';
import { STORY, phaseReached, type Dest, type Phase } from '../publish';
import s from './Stages.module.css';

const INVITE: Record<Dest, string> = {
  ios: 'Tap the check on set 3 yourself, or watch Xroga do it.',
  android: 'Press Lift yourself, or watch Xroga play.',
  chrome: 'Click the MerchantLens button yourself, or watch Xroga do it.',
};

export function Xcard({ dest, phase, href, progress }: { dest: Dest; phase: Phase; href: string; progress?: string }) {
  const S = STORY[dest];
  const state = phase === 'ready' ? 'owner' : phaseReached(phase, 'finding') ? 'finding' : phase === 'idle' ? 'idle' : 'testing';
  return (
    <div className={s.xcard} data-state={state} aria-live="polite">
      <span className={s.xKicker}>
        <i aria-hidden="true" />
        {state === 'owner' ? 'Owner decision' : state === 'finding' ? S.finding.kicker : state === 'testing' ? 'Xroga · testing in preview' : 'Xroga · ready'}
      </span>
      {state === 'owner' ? (
        <>
          <b className={s.xTitle}>{S.owner.title}</b>
          <ol className={s.xSteps}>
            {S.owner.steps.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
          <Link href={href} className={s.xCta}>
            Review in Xroga
            <span aria-hidden="true">→</span>
          </Link>
        </>
      ) : state === 'finding' ? (
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
    </div>
  );
}
