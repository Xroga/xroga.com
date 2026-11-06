'use client';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import styles from './response-v2.module.css';
export default function MathV2({ formula, source, display }: { formula: string; source: string; display: boolean }) {
  try {
    const markup = katex.renderToString(formula, { displayMode: display, throwOnError: true, trust: false, strict: 'error', maxExpand: 200, maxSize: 20, output: 'htmlAndMathml' });
    // Only KaTeX's trusted renderer creates markup. Model HTML is never inserted.
    return <span className={styles.math} aria-label={source} dangerouslySetInnerHTML={{ __html: markup }} />;
  } catch { return <span>{source}</span>; }
}
