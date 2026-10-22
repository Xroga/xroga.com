import styles from './BlackHoleMark.module.css';

/** Drawn in CSS so the same brand mark can orbit while working and rest when complete. */
export function BlackHoleMark({ active = false, className = '' }: { active?: boolean; className?: string }) {
  return (
    <span className={`${styles.mark} ${active ? styles.active : ''} ${className}`} aria-hidden="true">
      <span className={styles.corona} />
      <span className={styles.ring} />
      <span className={styles.void} />
      <span className={styles.disk} />
      <span className={styles.spark} />
    </span>
  );
}
