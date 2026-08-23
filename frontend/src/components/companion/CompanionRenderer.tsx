'use client';

import { cn } from '@/lib/utils';
import type { CompanionAccent, CompanionCostume, CompanionMood, CompanionOperation } from '@/lib/companion';

interface CompanionRendererProps {
  mood: CompanionMood;
  operation: CompanionOperation;
  costume: CompanionCostume;
  accent: CompanionAccent;
  mantleEnabled: boolean;
  className?: string;
  decorative?: boolean;
  /** Overrides the costume artwork. Only the wardrobe preview needs this. */
  portraitSrc?: string;
}

/**
 * Artwork for a costume.
 *
 * Every surface resolves this from the selected costume, which is the fix for
 * choosing a skin appearing to do nothing: previously only the wardrobe preview
 * passed a portrait, and every other surface fell back to a CSS sprite that carried
 * `data-costume` but had no per-costume art. Changing costume moved an attribute and
 * nothing else.
 */
export function costumeImage(costume: CompanionCostume): string {
  return `/brand/costumes/${costume}.webp`;
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
  mantleEnabled,
  className,
  decorative = true,
  portraitSrc,
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
      {/* One rendering path for every surface, so the selected skin is always what
          shows. `data-*` stays on the element because CSS keys the pose loop's speed
          off the real operation. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={portraitSrc ?? costumeImage(costume)}
        alt=""
        className={cn('xv-companion-renderer', `xv-smoky-pose--${pose}`)}
        data-mood={mood}
        data-operation={operation}
        data-costume={costume}
        data-accent={accent}
        aria-hidden="true"
        loading="lazy"
        decoding="async"
      />
      {mantleEnabled && <span className="xv-companion-mantle-mark" data-accent={accent} aria-hidden="true" />}
    </span>
  );
}
