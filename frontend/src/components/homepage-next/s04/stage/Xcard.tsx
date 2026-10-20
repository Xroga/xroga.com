'use client';

/**
 * The Xroga card: the one place Xroga speaks in a scene.
 *   ready → testing → the work panel (what Xroga is accomplishing, its live tasks, the spec as quiet metadata)
 *   → the release handoff (Handoff.tsx).
 * Tasks settle in step with the scene's beats, so the card and the stage always say the same thing.
 */
import { ArcsetIcon } from '../apps/Arcset';
import { FernwayIcon } from '../apps/Fernway';
import { LensIcon } from '../apps/MerchantLens';
import { STORY, beatIndex, phaseReached, type Dest, type Phase } from '../publish';
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

export function Xcard({ dest, phase, beat, href, journey = false }: { dest: Dest; phase: Phase; beat: string; href: string; journey?: boolean }) {
  const S = STORY[dest];
  const state = phase === 'ready' ? 'owner' : phaseReached(phase, 'finding') ? 'working' : phase === 'idle' ? 'idle' : 'testing';
  if (state === 'owner') {
    const Icon = dest === 'ios' ? ArcsetIcon : dest === 'android' ? FernwayIcon : LensIcon;
    return <Handoff dest={dest} href={href} product={<Icon size={44} />} />;
  }
  const now = beatIndex(dest, beat);
  return (
    <div className={s.xcard} data-state={state} data-journey={journey || undefined} aria-live="polite">
      <span className={s.xKicker}>
        <i aria-hidden="true" />
        {state === 'working' ? 'Xroga is working' : state === 'testing' ? 'Xroga · testing in preview' : 'Xroga · ready'}
      </span>
      {state === 'working' ? (
        <>
          <b className={s.xTitle}>{S.work.title}</b>
          <ol className={s.tasks}>
            {S.work.tasks.map((t) => {
              const st = now >= beatIndex(dest, t.to) ? 'done' : now >= beatIndex(dest, t.from) ? 'working' : 'next';
              return (
                <li key={t.label} data-state={st}>
                  <i aria-hidden="true" />
                  {t.label}
                </li>
              );
            })}
          </ol>
          <small className={s.spec}>{S.work.spec}</small>
        </>
      ) : (
        <>
          <b className={s.xTitle}>{state === 'idle' ? S.say.idle : S.say[phase]}</b>
          <span className={s.xDetail}>{state === 'idle' ? INVITE[dest] : 'Illustrative test of the product’s own behavior.'}</span>
        </>
      )}
      {journey && state !== 'working' && (
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
