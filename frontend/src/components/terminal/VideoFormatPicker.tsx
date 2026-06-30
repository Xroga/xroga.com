'use client';

import { createPortal } from 'react-dom';
import { Film, Smartphone, Tv, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VideoFormatId } from '@/lib/videoFormat';

interface VideoFormatPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (format: VideoFormatId) => void;
}

export function VideoFormatPicker({ open, onClose, onSelect }: VideoFormatPickerProps) {
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[240] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={onClose} aria-label="Close" />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--card-border)]">
          <div className="flex items-center gap-2">
            <Film className="h-4 w-4 text-[var(--accent)]" />
            <p className="text-sm font-bold">Choose video format</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-[var(--muted)]/10" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="px-4 pt-3 text-[11px] text-[var(--muted)]">
          Pick where you plan to post — we render the right aspect ratio and show matching share buttons.
        </p>
        <div className="p-4 grid gap-2">
          <FormatOption
            icon={Smartphone}
            title="Shorts / Reels / TikTok"
            subtitle="Vertical 9:16 · mobile"
            onClick={() => onSelect('shorts_reels')}
          />
          <FormatOption
            icon={Tv}
            title="YouTube Video"
            subtitle="Landscape 16:9 · widescreen"
            onClick={() => onSelect('youtube_video')}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function FormatOption({
  icon: Icon,
  title,
  subtitle,
  onClick,
}: {
  icon: typeof Film;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 w-full text-left rounded-xl border border-[var(--card-border)] px-3 py-3',
        'hover:border-[var(--accent)]/40 hover:bg-[var(--accent)]/5 transition-all active:scale-[0.98]',
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/10 shrink-0">
        <Icon className="h-5 w-5 text-[var(--accent)]" />
      </div>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-[10px] text-[var(--muted)]">{subtitle}</p>
      </div>
    </button>
  );
}
