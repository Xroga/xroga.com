'use client';

/*
 * From Uiverse.io by neerajbaniwal - https://uiverse.io/neerajbaniwal/hungry-mule-59
 * MIT License, Copyright (c) neerajbaniwal (Neeraj)
 *
 * Adapted for Xroga. The original is an absolutely centred `<a class="btn-shine">`; here the sweep is applied to a
 * call-to-action label inside an existing button or link, so positioning, padding and the click target stay with that
 * element. The gradient geometry and the 3s linear sweep are the original's. The grey base is lightened so the label stays
 * readable on Xroga's blue button, the class is scoped by a CSS module, and the sweep stops for reduced-motion users.
 */
import type { ReactNode } from 'react';
import styles from './UiverseShineText.module.css';

export function UiverseShineText({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={className ? `${styles.btnShine} ${className}` : styles.btnShine}>{children}</span>;
}
