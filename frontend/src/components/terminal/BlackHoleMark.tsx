import type { CSSProperties } from 'react';
import Image from 'next/image';
import styles from './BlackHoleMark.module.css';

/** The supplied black-hole artwork, extracted from its square background. */
export function BlackHoleMark({ active = false, className = '' }: { active?: boolean; className?: string }) {
  return <span className={`${styles.mark} ${active ? styles.active : ''} ${className}`} aria-hidden="true">
    <Image className={styles.art} src="/black-hole-cutout-v2.png" alt="" width={96} height={96} unoptimized />
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
