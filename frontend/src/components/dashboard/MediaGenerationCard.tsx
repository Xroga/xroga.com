'use client';

import { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Trash2,
  Terminal,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { copyImageToClipboard, downloadImage } from '@/lib/imageStudioUtils';
import type { MediaGenerationGroup } from '@/lib/mediaHelpers';
import toast from 'react-hot-toast';

interface MediaGenerationCardProps {
  group: MediaGenerationGroup;
  selected?: boolean;
  onOpenExisting: () => void;
  onOpenNewTerminal: () => void;
  onDelete: () => void;
  onDeleteVariant?: (url: string) => void;
}

export function MediaGenerationCard({
  group,
  selected,
  onOpenExisting,
  onOpenNewTerminal,
  onDelete,
}: MediaGenerationCardProps) {
  const variants = group.variants.length > 0 ? group.variants : [group.item.url];
  const [activeIndex, setActiveIndex] = useState(0);
  const safeIndex = Math.min(activeIndex, variants.length - 1);
  const activeUrl = variants[safeIndex] ?? group.item.url;
  const count = variants.length;

  function goPrev() {
    setActiveIndex((i) => (i <= 0 ? count - 1 : i - 1));
  }

  function goNext() {
    setActiveIndex((i) => (i >= count - 1 ? 0 : i + 1));
  }

  async function handleDownload(url: string) {
    try {
      await downloadImage(url, `xroga-${group.id.slice(0, 8)}.png`);
      toast.success('Downloaded');
    } catch {
      toast.error('Download failed');
    }
  }

  async function handleCopy(url: string) {
    const ok = await copyImageToClipboard(url);
    if (ok) toast.success('Copied to clipboard');
    else toast.error('Copy failed');
  }

  return (
    <div
      className={cn(
        'glass-panel rounded-2xl border overflow-hidden transition-all',
        selected ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/30' : 'border-[var(--card-border)]',
      )}
    >
      <div className="px-4 py-3 border-b border-[var(--card-border)]/60 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold truncate">{group.label}</p>
          <p className="text-[9px] text-[var(--muted)] mt-0.5">
            {count} variant{count === 1 ? '' : 's'} · {new Date(group.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onOpenExisting}
            className="text-[10px] px-2.5 py-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--card)]/60 hover:border-[var(--accent)]/40 flex items-center gap-1"
            title="Open in existing terminal — full thread where this was created"
          >
            <Terminal className="h-3 w-3 text-[var(--accent)]" />
            Existing terminal
          </button>
          <button
            type="button"
            onClick={onOpenNewTerminal}
            className="text-[10px] px-2.5 py-1.5 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/15 flex items-center gap-1"
            title="Open in new terminal — this prompt and image output only"
          >
            <Sparkles className="h-3 w-3" />
            New terminal
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div className="relative rounded-xl overflow-hidden bg-black/5 dark:bg-black/25 border border-[var(--card-border)] aspect-square max-h-[min(420px,55vw)] w-full mx-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={activeUrl}
            alt={group.prompt}
            className="h-full w-full object-contain"
          />

          {count > 1 && (
            <>
              <button
                type="button"
                onClick={goPrev}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70"
                aria-label="Previous variant"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={goNext}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70"
                aria-label="Next variant"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <span className="absolute top-2 right-2 z-10 rounded-full bg-black/50 px-2 py-0.5 text-[9px] font-medium text-white">
                {safeIndex + 1}/{count}
              </span>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 z-10">
                {variants.map((_, i) => (
                  <button
                    key={`dot-${i}`}
                    type="button"
                    onClick={() => setActiveIndex(i)}
                    className={cn(
                      'h-1.5 rounded-full transition-all',
                      i === safeIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/80',
                    )}
                    aria-label={`Variant ${i + 1}`}
                  />
                ))}
              </div>
            </>
          )}

          <div className="absolute bottom-2 left-2 flex gap-1 z-10">
            <IconAction icon={Download} label="Download" onClick={() => void handleDownload(activeUrl)} />
            <IconAction icon={Copy} label="Copy" onClick={() => void handleCopy(activeUrl)} />
            <IconAction icon={Trash2} label="Delete generation" onClick={onDelete} danger />
          </div>
        </div>

        {count > 1 && (
          <div>
            <p className="text-[9px] font-medium uppercase tracking-wide text-[var(--muted)] mb-1.5 px-0.5">
              Other variants
            </p>
            <div
              className={cn(
                'grid gap-2',
                count === 2 && 'grid-cols-2',
                count === 3 && 'grid-cols-3',
                count >= 4 && 'grid-cols-4',
              )}
            >
              {variants.map((url, i) => (
                <div
                  key={`${url.slice(-24)}-${i}`}
                  className={cn(
                    'group relative aspect-square rounded-lg overflow-hidden border bg-[var(--muted)]/8',
                    i === safeIndex ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]/40' : 'border-[var(--card-border)]',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setActiveIndex(i)}
                    className="absolute inset-0 flex items-center justify-center p-0.5"
                    aria-label={`Select variant ${i + 1}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="max-h-full max-w-full object-contain" />
                  </button>
                  <div className="absolute bottom-0 inset-x-0 flex items-center justify-center gap-0.5 bg-black/55 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <GridIcon icon={Download} label="Download" onClick={() => void handleDownload(url)} />
                    <GridIcon icon={Copy} label="Copy" onClick={() => void handleCopy(url)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-[10px] text-[var(--muted)] line-clamp-2 px-0.5" title={group.prompt}>
          <span className="font-medium text-[var(--foreground)]/70">Prompt: </span>
          {group.prompt}
        </p>
      </div>
    </div>
  );
}

function IconAction({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof Download;
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
        'flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm hover:bg-black/75 transition-colors',
        danger && 'hover:bg-red-600/80',
      )}
      aria-label={label}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function GridIcon({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Download;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="p-1 rounded text-white/90 hover:bg-white/15"
      aria-label={label}
    >
      <Icon className="h-2.5 w-2.5" />
    </button>
  );
}
