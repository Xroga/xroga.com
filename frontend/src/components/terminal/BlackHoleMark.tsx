import type { CSSProperties } from 'react';
import styles from './BlackHoleMark.module.css';

/** The exact uploaded black-hole mark, now a transparent SVG mask (theme-aware). */
export function BlackHoleMark({ active = false, className = '' }: { active?: boolean; className?: string }) {
  return <span className={`${styles.mark} ${active ? styles.active : ''} ${className}`} aria-hidden="true">
    <span className={styles.art} />
  </span>;
}

/** The black-hole mark with a restrained motion state and accessible brand text. */
export function BlackHoleWordmark({ active = false }: { active?: boolean }) {
  return <span className={`${styles.wordmark} ${active ? styles.active : ''}`} aria-label="Xroga Black Hole">
    <BlackHoleMark active={active} />
    <span className={styles.brand}>Xroga</span>
    <span className={styles.letters} aria-hidden="true">{'Black Hole'.split('').map((letter, index) => <span key={index} className={styles.letter} style={{ '--letter-index': index } as CSSProperties}>{letter === ' ' ? '\u00a0' : letter}</span>)}</span>
  </span>;
}
