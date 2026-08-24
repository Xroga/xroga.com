'use client';

import { Suspense, lazy } from 'react';

export { equationToLatex } from './equationToLatex';

/**
 * A rendered equation, with the typesetter loaded only when one appears.
 *
 * KaTeX was imported statically here, which put ~256 kB of JavaScript into the first
 * load of `/workspace` — the app's largest route — plus a 23 kB stylesheet that
 * `globals.css` then put on every page of the site, for a feature that only runs when
 * a reply happens to contain an equation line. Both now travel in a chunk fetched on
 * first use.
 *
 * `lazy` rather than `next/dynamic` because the fallback needs the props: dynamic's
 * `loading` receives none, so it could only render an empty box, and an equation that
 * collapses to nothing and then reappears shifts the text under the reader. The
 * fallback here is the same plain-text form the renderer falls back to when KaTeX
 * throws, in the same element, so the line keeps its shape while the chunk is in
 * flight.
 */
const MathEquationImpl = lazy(() => import('./mathRenderImpl'));

export function MathEquation({
  text,
  className,
  display = true,
}: {
  text: string;
  className?: string;
  display?: boolean;
}) {
  const plain = text.replace(/\*/g, '·');
  const fallback = display
    ? <div className={className} aria-label={text}>{plain}</div>
    : <span className={className} aria-label={text}>{plain}</span>;

  return (
    <Suspense fallback={fallback}>
      <MathEquationImpl text={text} className={className} display={display} />
    </Suspense>
  );
}
