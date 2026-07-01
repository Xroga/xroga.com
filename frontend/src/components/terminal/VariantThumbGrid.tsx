'use client';

import { Copy, Download, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function previewAspectClass(
  aspectFormat?: string,
  isYoutubeThumbnail?: boolean,
  contentType?: string,
): string {
  if (
    aspectFormat === '16:9' ||
    isYoutubeThumbnail ||
    contentType === 'thumbnail' ||
    contentType === 'og' ||
    contentType === 'banner'
  ) {
    return 'aspect-video';
  }
  if (aspectFormat === '9:16' || contentType === 'story' || contentType === 'wallpaper') {
    return 'aspect-[9/16] max-h-96 w-full';
  }
  if (aspectFormat === '4:5' || aspectFormat === '3:4') return 'aspect-[4/5] max-h-80 w-full';
  if (contentType === 'logo' || contentType === 'avatar') return 'aspect-square max-h-64 w-full';
  return 'aspect-square max-h-72 w-full';
}

/** Compact grid thumb — fixed height, real image proportions via object-contain */
export function gridThumbFrameClass(
  aspectFormat?: string,
  isYoutubeThumbnail?: boolean,
  contentType?: string,
): string {
  if (aspectFormat === '16:9' || isYoutubeThumbnail || contentType === 'thumbnail') return 'h-[72px]';
  if (aspectFormat === '9:16' || contentType === 'story') return 'h-[88px]';
  if (aspectFormat === '4:5' || aspectFormat === '3:4') return 'h-[80px]';
  return 'h-[76px]';
}

interface VariantThumb {
  imageUrl: string;
  variantLabel?: string;
  provider?: string;
  variantIndex?: number;
}

interface VariantThumbGridProps {
  variants: VariantThumb[];
  activeUrl?: string;
  aspectFormat?: string;
  isYoutubeThumbnail?: boolean;
  contentType?: string;
  onEdit: (url: string) => void;
  onCopy: (url: string) => void;
  onDownload: (url: string) => void;
  onRemove: (url: string) => void;
}

export function VariantThumbGrid({
  variants,
  activeUrl,
  aspectFormat,
  isYoutubeThumbnail,
  contentType,
  onEdit,
  onCopy,
  onDownload,
  onRemove,
}: VariantThumbGridProps) {
  const frameH = gridThumbFrameClass(aspectFormat, isYoutubeThumbnail, contentType);

  if (variants.length <= 1) return null;

  return (
    <div>
      <p className="text-[9px] font-medium uppercase tracking-wide text-[var(--muted)] mb-1 px-0.5">
        Other variants
      </p>
      <div className="grid grid-cols-4 gap-1.5">
        {variants.map((v, i) => {
          const isActive = v.imageUrl === activeUrl;
          return (
            <div
              key={`thumb-${v.variantIndex ?? i}-${v.provider ?? 'v'}`}
              className={cn(
                'group relative rounded-lg border bg-[var(--muted)]/8 overflow-hidden transition-colors',
                frameH,
                isActive ? 'border-[var(--accent)]' : 'border-[var(--card-border)]',
              )}
            >
              <button
                type="button"
                onClick={() => onEdit(v.imageUrl)}
                className="absolute inset-0 flex items-center justify-center p-0.5"
                aria-label={`Edit ${v.variantLabel ?? v.provider ?? 'variant'}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={v.imageUrl} alt="" className="max-h-full max-w-full object-contain" />
              </button>

              <span className="absolute top-0 left-0 right-0 text-[6px] font-medium text-white/90 bg-black/45 px-1 py-0.5 truncate pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                {v.variantLabel ?? v.provider}
              </span>

              <div className="absolute bottom-0 inset-x-0 flex items-center justify-center gap-0.5 bg-black/55 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <GridAction icon={Copy} label="Copy" onClick={() => onCopy(v.imageUrl)} />
                <GridAction icon={Download} label="Save" onClick={() => onDownload(v.imageUrl)} />
                <GridAction icon={Trash2} label="Remove" onClick={() => onRemove(v.imageUrl)} danger />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GridAction({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof Copy;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'p-0.5 rounded text-white/90 hover:bg-white/15',
        danger && 'hover:text-red-300',
      )}
      aria-label={label}
    >
      <Icon className="h-2.5 w-2.5" />
    </button>
  );
}
