'use client';

import { useEffect, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Wand2, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { downloadImage } from '@/lib/imageStudioUtils';
import { useThemeStore } from '@/store/useThemeStore';

interface ImagePreviewModalProps {
  open: boolean;
  onClose: () => void;
  src: string;
  alt?: string;
  label?: string;
  onEdit?: () => void;
}

export function ImagePreviewModal({
  open,
  onClose,
  src,
  alt = 'Image preview',
  label,
  onEdit,
}: ImagePreviewModalProps) {
  const siteTheme = useThemeStore((s) => s.theme);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const themeClass =
    siteTheme === 'white'
      ? 'xv-img-lightbox--white'
      : siteTheme === 'black'
        ? 'xv-img-lightbox--black'
        : 'xv-img-lightbox--gray';

  return createPortal(
    <div className={cn('xv-img-lightbox fixed inset-0 z-[220] flex flex-col', themeClass)}>
      <div className="xv-img-lightbox-backdrop absolute inset-0" onClick={onClose} aria-hidden />

      <header className="relative z-10 flex items-center justify-between gap-3 px-4 py-3 shrink-0">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--foreground)] truncate">
            {label ?? 'Image preview'}
          </p>
          <p className="text-[10px] text-[var(--muted)]">Tap outside or press Esc to close</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <LightboxBtn icon={Download} label="Save" onClick={() => downloadImage(src, 'xroga-image.png')} />
          {onEdit && <LightboxBtn icon={Wand2} label="Edit" onClick={onEdit} accent />}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl border border-[var(--card-border)] bg-[var(--card)]/80 hover:bg-[var(--card)] text-[var(--muted)] transition-colors"
            aria-label="Close preview"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-8 min-h-0 overflow-auto">
        <div className="xv-img-lightbox-frame relative max-w-full max-h-full rounded-2xl overflow-hidden shadow-2xl ring-1 ring-[var(--card-border)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className="max-w-[min(92vw,900px)] max-h-[min(72vh,720px)] w-auto h-auto object-contain block"
          />
          <div className="absolute bottom-3 right-3 opacity-60 pointer-events-none">
            <Maximize2 className="w-4 h-4 text-white drop-shadow" />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function LightboxBtn({
  icon: Icon,
  label,
  onClick,
  accent,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition-colors',
        accent
          ? 'border-[var(--accent)]/40 bg-[var(--accent)]/15 text-[var(--accent)] hover:bg-[var(--accent)]/25'
          : 'border-[var(--card-border)] bg-[var(--card)]/80 text-[var(--foreground)] hover:bg-[var(--card)]'
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
