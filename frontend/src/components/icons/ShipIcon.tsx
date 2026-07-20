'use client';

import type { Variants } from 'motion/react';
import { motion, useAnimation } from 'motion/react';
import type { HTMLAttributes } from 'react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';

import { cn } from '@/lib/utils';

export interface ShipIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface ShipIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  /** When true, boat rocks on water until set false (send → AI complete). */
  sailing?: boolean;
  /** Thicker stroke for send button presence. */
  bold?: boolean;
}

const PATH_VARIANTS: Variants = {
  normal: {
    pathLength: 1,
    opacity: 1,
  },
  animate: {
    pathLength: [0, 1],
    opacity: [0, 1],
    transition: {
      delay: 0.15,
      opacity: { delay: 0.1 },
    },
  },
};

const G_VARIANTS: Variants = {
  normal: { rotate: 0 },
  animate: {
    rotate: [-3, 3, -3],
    transition: {
      repeat: Number.POSITIVE_INFINITY,
      repeatType: 'mirror' as const,
      duration: 1.2,
      ease: 'easeInOut',
    },
  },
};

const ShipIcon = forwardRef<ShipIconHandle, ShipIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, sailing = false, bold = false, ...props }, ref) => {
    const controls = useAnimation();
    const isControlledRef = useRef(false);

    useImperativeHandle(ref, () => {
      isControlledRef.current = true;

      return {
        startAnimation: () => {
          void controls.start('animate');
        },
        stopAnimation: () => {
          void controls.start('normal');
        },
      };
    });

    useEffect(() => {
      void controls.start(sailing ? 'animate' : 'normal');
    }, [sailing, controls]);

    const handleMouseEnter = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isControlledRef.current && !sailing) {
          void controls.start('animate');
        }
        onMouseEnter?.(e);
      },
      [controls, onMouseEnter, sailing]
    );

    const handleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isControlledRef.current && !sailing) {
          void controls.start('normal');
        }
        onMouseLeave?.(e);
      },
      [controls, onMouseLeave, sailing]
    );

    return (
      <div
        className={cn('inline-flex items-center justify-center', className)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        <svg
          fill="none"
          height={size}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={bold ? 2.75 : 2}
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
          className={bold ? 'xv-ship-icon--bold' : undefined}
        >
          <motion.path
            animate={controls}
            d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 .6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"
            variants={PATH_VARIANTS}
            initial="normal"
          />
          <motion.g animate={controls} variants={G_VARIANTS} initial="normal">
            <path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76" />
            <path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6" />
            <path d="M12 10v4" />
            <path d="M12 2v3" />
          </motion.g>
        </svg>
      </div>
    );
  }
);

ShipIcon.displayName = 'ShipIcon';

export { ShipIcon };
