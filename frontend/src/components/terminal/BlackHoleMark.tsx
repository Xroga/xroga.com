import type { CSSProperties } from 'react';
import styles from './BlackHoleMark.module.css';

/** A resolution-independent silver accretion mark, drawn entirely in code. */
export function BlackHoleMark({ active = false, className = '' }: { active?: boolean; className?: string }) {
  return <span className={`${styles.mark} ${active ? styles.active : ''} ${className}`} aria-hidden="true">
    <svg className={styles.art} viewBox="0 0 64 64" fill="none" focusable="false">
      <defs>
        <linearGradient id="xroga-silver-disk" x1="5" y1="38" x2="59" y2="26" gradientUnits="userSpaceOnUse"><stop stopColor="#5d6571" /><stop offset=".22" stopColor="#d9dce1" /><stop offset=".48" stopColor="#fff" /><stop offset=".73" stopColor="#9ba4b2" /><stop offset="1" stopColor="#f4f6f9" /></linearGradient>
        <linearGradient id="xroga-silver-halo" x1="15" y1="10" x2="48" y2="54" gradientUnits="userSpaceOnUse"><stop stopColor="#f5f6f8" /><stop offset=".5" stopColor="#7c8592" /><stop offset="1" stopColor="#e4e7eb" /></linearGradient>
      </defs>
      <circle cx="32" cy="32" r="21" stroke="url(#xroga-silver-halo)" strokeWidth="1.3" opacity=".4" />
      <circle cx="32" cy="32" r="16" stroke="url(#xroga-silver-halo)" strokeWidth="2.3" />
      <circle cx="32" cy="32" r="12.4" fill="#050607" />
      <path d="M5 37.5c8.4-5.8 18.3-9.2 29.3-10.2 10.3-.9 19.1 1.8 24.7 5.3-7.8-.8-17.6-.4-27.3 1.2C20.7 35.4 11.8 38 5 41c7.7-1.4 17.3-2.4 28.1-3.4 10.8-.9 19.4-3.2 25.9-8.3-6.2 7.1-14.8 10.8-26.4 12.4C22.3 43.1 12.9 42.3 5 37.5Z" fill="url(#xroga-silver-disk)" opacity=".88" />
      <path d="M4 39c13-5.6 29.9-10.2 55-7.5" stroke="#fff" strokeWidth=".65" opacity=".8" />
    </svg>
    <span className={styles.orbit} />
    <span className={styles.particleOne} />
    <span className={styles.particleTwo} />
    <span className={styles.particleThree} />
  </span>;
}

/** Uiverse rotating-loader and staggered-letter rhythm, with truthful brand text. */
export function BlackHoleWordmark({ active = false }: { active?: boolean }) {
  return <span className={`${styles.wordmark} ${active ? styles.active : ''}`} aria-label="Xroga Black Hole">
    <BlackHoleMark active={active} />
    <span className={styles.brand}>Xroga</span>
    <span className={styles.letters} aria-hidden="true">{'Black Hole'.split('').map((letter, index) => <span key={index} className={styles.letter} style={{ '--letter-index': index } as CSSProperties}>{letter === ' ' ? '\u00a0' : letter}</span>)}</span>
  </span>;
}
