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

export function CompanionRenderer({ mood, operation, costume, accent, className, decorative = true }: CompanionRendererProps) {
  const pose = poseFor(operation, mood);
  return <span
    className={cn('xv-companion-renderer xv-smoky-sprite', `xv-smoky-sprite--${pose}`, className)}
    data-mood={mood}
    data-operation={operation}
    data-costume={costume}
    data-accent={accent}
    role={decorative ? undefined : 'img'}
    aria-hidden={decorative || undefined}
    aria-label={decorative ? undefined : `Smoky, the Xroga voxel cat, ${mood} and ${operation.replaceAll('_', ' ')}`}
  />;
}
