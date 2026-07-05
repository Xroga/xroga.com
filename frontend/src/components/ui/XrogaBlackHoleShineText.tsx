'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Uiverse-inspired shine sweep — XROGA Black Hole processing text (not "Get early access"). */
export function XrogaBlackHoleShineText({
  children,
  className,
  as: Tag = 'span',
}: {
  children: ReactNode;
  className?: string;
  as?: 'span' | 'p' | 'div';
}) {
  return <Tag className={cn('xv-blackhole-shine', className)}>{children}</Tag>;
}
