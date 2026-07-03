'use client';

import katex from 'katex';
import { useMemo } from 'react';

/** Convert plain equation text to LaTeX for KaTeX rendering */
export function equationToLatex(text: string): string {
  let out = text.trim();
  out = out.replace(/\*/g, ' \\cdot ');
  out = out.replace(/(\d+)\s*\/\s*(\d+)/g, '\\frac{$1}{$2}');
  out = out.replace(/(\d)([a-z])/gi, '$1$2');
  return out;
}

export function MathEquation({
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
