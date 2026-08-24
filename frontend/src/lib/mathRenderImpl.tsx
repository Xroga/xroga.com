'use client';

import katex from 'katex';
import 'katex/dist/katex.min.css';
import { useMemo } from 'react';
import { equationToLatex } from './equationToLatex';

/**
 * The half of the maths renderer that actually costs something.
 *
 * KaTeX is ~256 kB of JavaScript and a 23 kB stylesheet, and a coding agent renders
 * an equation in a small minority of replies — yet a static import put all of it in
 * the first load of `/workspace`, and the `@import` in globals.css put the stylesheet
 * on every page of the site, marketing pages included.
 *
 * Kept in its own module so the wrapper can reach it through `next/dynamic`: both the
 * library and its stylesheet then travel in a chunk that is fetched the first time an
 * equation appears, and never otherwise. The stylesheet is imported here rather than
 * globally for the same reason — Next attaches it to this chunk.
 */
export default function MathEquationImpl({
  text,
  className,
  display = true,
}: {
  text: string;
  className?: string;
  display?: boolean;
}) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(equationToLatex(text), {
        throwOnError: false,
        displayMode: display,
        output: 'html',
      });
    } catch {
      return text.replace(/\*/g, '·');
    }
  }, [text, display]);

  if (display) {
    return (
      <div
        className={className}
        dangerouslySetInnerHTML={{ __html: html }}
        aria-label={text}
      />
    );
  }

  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
      aria-label={text}
    />
  );
}
