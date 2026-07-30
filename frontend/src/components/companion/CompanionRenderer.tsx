'use client';

import { cn } from '@/lib/utils';
import type { CompanionAccent, CompanionCostume, CompanionMood, CompanionOperation } from '@/lib/companion';

interface CompanionRendererProps {
  mood: CompanionMood;
  operation: CompanionOperation;
  costume: CompanionCostume;
  accent: CompanionAccent;
  crownEnabled: boolean;
  mantleEnabled: boolean;
  className?: string;
  decorative?: boolean;
}

function poseFor(operation: CompanionOperation, mood: CompanionMood): string {
  if (operation === 'listening') return 'listening';
  if (['thinking', 'planning', 'reading', 'inspecting_repository'].includes(operation)) return 'thinking';
  if (['coding', 'building', 'testing', 'repairing'].includes(operation)) return 'coding';
  if (operation === 'success' || mood === 'happy') return 'success';
  if (['warning', 'failure', 'offline', 'interrupted', 'waiting_for_approval'].includes(operation)) return 'warning';
  return 'greeting';
}

export function CompanionRenderer({
  mood,
  operation,
  costume,
  accent,
  crownEnabled,
  mantleEnabled,
  className,
  decorative = true,
}: CompanionRendererProps) {
  const pose = poseFor(operation, mood);
  const label = decorative ? undefined : `Smoky, the Xroga voxel cat, ${mood} and ${operation.replaceAll('_', ' ')}`;
  return (
    <span
      className={cn('xv-companion-stage', className)}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={label}
    >
      <span
        className={cn('xv-companion-renderer xv-smoky-sprite', `xv-smoky-sprite--${pose}`)}
        data-mood={mood}
        data-operation={operation}
        data-costume={costume}
        data-accent={accent}
        aria-hidden="true"
      />
      {mantleEnabled && <span className="xv-companion-mantle-mark" data-accent={accent} aria-hidden="true" />}
      {crownEnabled && (
        <svg viewBox="0 0 24 24" className="xv-companion-crown-mark" data-accent={accent} aria-hidden="true" focusable="false">
          {/* Xroga's protected X-shaped identity mark, worn as the companion's crown badge. */}
          <circle cx="12" cy="12" r="11" fill="currentColor" opacity="0.16" />
          <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" strokeWidth="1.25" />
          <path
            d="M7.2 7.2 L16.8 16.8 M16.8 7.2 L7.2 16.8"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      )}
    </span>
  );
}
