'use client';

/**
 * The secondary line (V12 §6–§9): a fixed "One workspace to" and one capability phrase for the current
 * scene. The phrase changes under a short vertical mask, driven by the orchestration clock, so the line can
 * never disagree with the stage. The H1 carries the hero's only shine.
 * Screen readers get one static sentence instead of a carousel.
 */
import { COPY, PHRASES, PHRASES_MOBILE, type PhraseKey } from './copy';
import s from './S00Hero.module.css';

export function Capability({
  phrase,
  prevPhrase,
  mobile,
  reduced,
}: {
  phrase: PhraseKey;
  prevPhrase: PhraseKey | null;
  mobile: boolean;
  reduced: boolean;
}) {
  const text = mobile ? PHRASES_MOBILE : PHRASES;
  if (reduced) {
    return (
      <p className={s.capability} data-reduced="">
        <span className={s.lead}>{COPY.lead}</span>{' '}
        <span className={s.slot}>
          <span className={s.phrase}>{COPY.reducedPhrase}</span>
        </span>
      </p>
    );
  }
  return (
    <p className={s.capability}>
      <span className={s.srOnly}>
        {COPY.lead} {COPY.reducedPhrase}
      </span>
      <span className={s.lead} aria-hidden="true">
        {COPY.lead}
      </span>{' '}
      <span className={s.slot} aria-hidden="true" data-phrase={phrase}>
        {prevPhrase && (
          <span key={`out-${prevPhrase}`} className={s.phrase} data-leg="out">
            {text[prevPhrase]}
          </span>
        )}
        <span key={phrase} className={s.phrase} data-leg={prevPhrase ? 'in' : undefined}>
          {text[phrase]}
        </span>
      </span>
    </p>
  );
}
