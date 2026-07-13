'use client';

import { Images } from 'lucide-react';
import { useThemeStore } from '@/store/useThemeStore';
import { useSlideshowIndex } from '@/components/providers/SlideshowIndexContext';
import { cn } from '@/lib/utils';

export function SlideshowToggle({ className, compact }: { className?: string; compact?: boolean }) {
  const theme = useThemeStore((s) => s.theme);
  const slideshowEnabled = useThemeStore((s) => s.slideshowEnabled);
  const setSlideshowEnabled = useThemeStore((s) => s.setSlideshowEnabled);
  const setSlideshowFrozenIndex = useThemeStore((s) => s.setSlideshowFrozenIndex);
  const slideIndex = useSlideshowIndex();

  if (theme !== 'image') return null;

  return (
    <button
      type="button"
      onClick={() => {
        if (slideshowEnabled) {
          setSlideshowFrozenIndex(slideIndex);
          setSlideshowEnabled(false);
        } else {
          setSlideshowEnabled(true);
        }
      }}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg border transition-colors',
        compact
          ? 'px-2 py-1 text-[10px] border-[var(--card-border)]/70 bg-black/20 hover:bg-white/5'
          : 'px-3 py-2 text-xs border-[var(--card-border)] bg-white/[0.03] hover:border-[var(--accent)]/40',
        className
      )}
      title={slideshowEnabled ? 'Freeze wallpaper on current image' : 'Resume wallpaper slideshow'}
      aria-pressed={slideshowEnabled}
    >
      <Images className={cn('shrink-0 text-[var(--accent)]', compact ? 'w-3 h-3' : 'w-3.5 h-3.5')} />
      <span className="font-goga font-medium text-[var(--foreground)]">
        {slideshowEnabled ? 'Slideshow on' : 'Slideshow off'}
      </span>
    </button>
  );
}
