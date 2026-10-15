'use client';

/**
 * S04 — Publish with Xroga. Gate A1 renders two candidate compositions for founder selection:
 * A · Release Lens and B · Distribution Editorial. Both show the same truthful story: a working product, the control
 * Xroga tested, the screen it captured, the store artwork made from it, the prepared package and the owner's next step.
 * The guided motion sequence is built only after a composition is chosen. The composition is chosen by the founder,
 * so until then `?s04Comp=A|B` (development only) switches between them; production renders A.
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ConceptA } from './ConceptA';
import { ConceptB } from './ConceptB';
import { COPY, type Dest, type Origin } from './publish';
import s from './S04.module.css';

export function S04Publish({ loggedIn = false }: { loggedIn?: boolean }) {
  const [comp, setComp] = useState<'A' | 'B'>('A');
  const [dest, setDest] = useState<Dest>('ios');
  const [origin, setOrigin] = useState<Origin>('existing');
  const [acted, setActed] = useState(true);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const q = new URLSearchParams(window.location.search);
    const c = q.get('s04Comp');
    if (c === 'A' || c === 'B') setComp(c);
    const d = q.get('s04Dest');
    if (d === 'ios' || d === 'android' || d === 'chrome') setDest(d);
    const o = q.get('s04Origin');
    if (o === 'existing' || o === 'xroga') setOrigin(o);
  }, []);

  const href = loggedIn ? '/dashboard/publish' : '/auth/signup';
  const cta = (
    <Link href={href} className={s.cta}>
      {COPY.cta}
      <span aria-hidden="true">→</span>
    </Link>
  );
  const props = {
    dest,
    origin,
    acted,
    onDest: (d: Dest) => {
      setDest(d);
      setActed(true);
    },
    onOrigin: setOrigin,
    onAction: () => setActed((v) => !v),
    cta,
  };

  return (
    <section id="s04" aria-labelledby="s04-title" className={s.section} data-comp={comp}>
      <div className={s.inner}>
        {comp === 'A' ? <ConceptA {...props} /> : <ConceptB {...props} />}
        <p className={s.note}>{COPY.note}</p>
      </div>
    </section>
  );
}
