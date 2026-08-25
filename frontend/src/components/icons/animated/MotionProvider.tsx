'use client';

import { LazyMotion, domAnimation } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * The single place `domAnimation` is imported.
 *
 * Each icon used to bring its own `LazyMotion` provider, which meant eighteen
 * modules importing the feature bundle. That is what put 46 kB back onto
 * /workspace once the icons spread from the sidebar into the composer, the message
 * log and the workspace panel: the bundler had no one owner to attribute it to.
 * One provider, imported by one module, and the icons carry only `m`.
 *
 * `strict` is deliberate — it makes the eager `motion` proxy a build-time error
 * inside this tree rather than a silent re-import of everything.
 */
export function IconMotion({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
}
