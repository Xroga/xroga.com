'use client';

import type { ComponentType } from 'react';
import { useState } from 'react';
import {
  Download,
  Copy,
  Trash2,
  Share2,
  Wand2,
  CheckCircle2,
  AlertTriangle,
  Tv,
  ThumbsUp,
  ThumbsDown,
  Palette,
  Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { copyImageToClipboard, downloadImage } from '@/lib/imageStudioUtils';
import { ImageEditModal } from './ImageEditModal';
import { TextGeneratingAnimation } from './TextGeneratingAnimation';
import { isPlaceholderImage } from '@/lib/parseImageContent';
import { addMediaItem } from '@/lib/mediaStorage';
import { useTerminalChat } from '@/context/TerminalChatContext';
import toast from 'react-hot-toast';

export interface RejectedImage {
  imageUrl: string;
  provider: string;
  matchScore: number;
  issues?: string[];
}

const FORMAT_LABELS: Record<string, string> = {
  '1:1': 'Post (1:1)',
  '4:5': 'Portrait (4:5)',
  '16:9': 'Landscape (16:9)',
  '9:16': 'Story (9:16)',
  '3:4': 'Portrait (3:4)',
  '4:3': 'Standard (4:3)',
};

export interface ImageOutputData {
  type: 'image';
  imageUrl: string;
  provider?: string;
  prompt?: string;
  verified?: boolean;
  matchScore?: number;
  rejectedImages?: RejectedImage[];
  isYoutubeThumbnail?: boolean;
  aspectFormat?: string;
  followUps?: string[];
}

interface ImageStudioCardProps {
  data: ImageOutputData;
  onDelete?: () => void;
  className?: string;
  generating?: boolean;
  message?: string;
  step?: string;
}

export function ImageGeneratingAnimation({
  className,
  message,
  step,
}: {
  className?: string;
  message?: string;
  step?: string;
}) {
  return (
    <div className={cn('my-3 space-y-2', className)}>
      <div className="flex items-center gap-2 px-1">
        <span className="text-[10px] font-semibold text-[var(--muted)]">Format:</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)]">
          Post (1:1) — default
        </span>
        <span className="text-[9px] text-[var(--muted)] hidden sm:inline">
          Add &quot;story&quot;, &quot;16:9&quot;, or &quot;portrait&quot; to your prompt for other ratios
        </span>
      </div>
      <TextGeneratingAnimation
        message={message}
        step={step}
        mode="image"
        sublabel="Xroga AI · Image Studio"
      />
    </div>
  );
}

export function ImageStudioCard({
  data,
  onDelete,
  className,
  generating,
  message,
  step,
}: ImageStudioCardProps) {
  const { setPrompt, submit } = useTerminalChat();
  const [editOpen, setEditOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [liked, setLiked] = useState<boolean | null>(null);
  const [editSrc, setEditSrc] = useState('');

  if (generating) {
    return <ImageGeneratingAnimation className={className} message={message} step={step} />;
  }

  if (hidden) return null;

  const {
    imageUrl: src,
    provider,
    prompt,
    verified,
    matchScore,
    rejectedImages,
    isYoutubeThumbnail,
    aspectFormat,
    followUps,
  } = data;

  const activeEditSrc = editSrc || src;

  if (isPlaceholderImage(src)) {
    return (
      <div className={cn('my-3 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-center', className)}>
        <p className="text-sm font-medium text-red-600 dark:text-red-300">Image generation failed</p>
        <p className="text-xs text-red-700/80 dark:text-red-200/70 mt-1">Please try again with a clearer prompt.</p>
      </div>
    );
  }

  function handleDelete() {
    setHidden(true);
    onDelete?.();
    toast.success('Image removed');
  }

  function handleSaveMedia() {
    addMediaItem({
      name: prompt?.slice(0, 40) || 'Xroga image',
      type: 'image',
      url: src,
    });
    toast.success('Saved to AI Media library');
  }

  function handleVariant(style?: string) {
    const base = prompt ?? 'this image';
    const text = style
      ? `Generate more variants of: ${base}. Style: ${style}`
      : `Generate more variants of: ${base}`;
    setPrompt(text);
    void submit(text);
    toast('Generating variants…', { icon: '🎨' });
  }

  function openEditor(url = src) {
    setEditSrc(url);
    setEditOpen(true);
  }

  const formatLabel = aspectFormat ? FORMAT_LABELS[aspectFormat] ?? aspectFormat : 'Post (1:1)';

  return (
    <>
      <div
        className={cn(
          'my-3 overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm',
          className
        )}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--card-border)] bg-[var(--background)]/50">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span className="text-xs font-semibold text-[var(--foreground)]">Image Studio</span>
            {provider && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--muted)]/15 text-[var(--foreground)] border border-[var(--card-border)]">
                {provider}
              </span>
            )}
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-[var(--card-border)] text-[var(--muted)]">
              {formatLabel}
            </span>
            {verified !== false ? (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                <CheckCircle2 className="h-3 w-3" />
                Verified{matchScore != null ? ` ${matchScore}%` : ''}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-200 border border-amber-500/30">
                <AlertTriangle className="h-3 w-3" />
                Best effort
              </span>
            )}
          </div>
        </div>

        <div className="p-2 sm:p-3 bg-[var(--background)]">
          <button
            type="button"
            onClick={() => openEditor()}
            className="w-full overflow-hidden rounded-lg border border-[var(--card-border)] bg-black/5 dark:bg-black/30 cursor-zoom-in hover:ring-2 hover:ring-[var(--accent)]/30 transition-shadow"
            aria-label="Open image editor"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={prompt ?? 'Generated image'}
              className={cn(
                'w-full max-h-[440px] object-contain mx-auto transition-opacity duration-500',
                revealed ? 'opacity-100' : 'opacity-0'
              )}
              loading="lazy"
              onLoad={() => setRevealed(true)}
            />
          </button>
          <p className="text-[9px] text-center text-[var(--muted)] mt-1.5">Tap image to edit</p>
        </div>

        {prompt && (
          <p className="px-3 text-[11px] text-[var(--muted)] line-clamp-2 border-t border-[var(--card-border)] pt-2">
            {prompt}
          </p>
        )}

        <div className="px-3 py-2 border-t border-[var(--card-border)] flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-[var(--muted)]">Like this?</span>
          <button
            type="button"
            onClick={() => setLiked(true)}
            className={cn(
              'p-1.5 rounded-lg border transition-colors',
              liked === true
                ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-600'
                : 'border-[var(--card-border)] hover:bg-[var(--muted)]/10'
            )}
            aria-label="Like"
          >
            <ThumbsUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setLiked(false);
              handleVariant('improve based on feedback');
            }}
            className={cn(
              'p-1.5 rounded-lg border transition-colors',
              liked === false
                ? 'border-amber-500/50 bg-amber-500/15 text-amber-600'
                : 'border-[var(--card-border)] hover:bg-[var(--muted)]/10'
            )}
            aria-label="Not quite"
          >
            <ThumbsDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleVariant()}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border border-[var(--accent)]/30 bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20"
          >
            <Layers className="h-3 w-3" />
            More variants
          </button>
          <button
            type="button"
            onClick={() => handleVariant('different artistic style')}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border border-[var(--card-border)] hover:bg-[var(--muted)]/10"
          >
            <Palette className="h-3 w-3" />
            Different style
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 px-3 pb-3 pt-1">
          <ActionBtn icon={Download} label="Download" onClick={() => downloadImage(src, 'xroga-image.png')} />
          <ActionBtn icon={Copy} label="Copy" onClick={() => copyImageToClipboard(src)} />
          <ActionBtn icon={Share2} label="Save to Media" onClick={handleSaveMedia} />
          {isYoutubeThumbnail && (
            <ActionBtn icon={Tv} label="Thumbnail" onClick={() => toast('Ask for a YouTube thumbnail variant', { icon: '🎬' })} accent="primary" />
          )}
          <ActionBtn icon={Wand2} label="Edit" onClick={openEditor} accent="primary" />
          <ActionBtn icon={Trash2} label="Delete" onClick={handleDelete} accent="danger" className="ml-auto" />
        </div>

        {rejectedImages && rejectedImages.length > 0 && (
          <div className="px-3 pb-3 border-t border-[var(--card-border)] pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)] mb-2">
              All AI attempts — tap to view full size
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {rejectedImages.map((img) => (
                <button
                  key={img.imageUrl}
                  type="button"
                  onClick={() => openEditor(img.imageUrl)}
                  className="relative rounded-lg overflow-hidden border border-[var(--card-border)] hover:ring-2 hover:ring-[var(--accent)]/40 text-left transition-all"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.imageUrl} alt="" className="w-full h-20 sm:h-24 object-cover" />
                  <span className="absolute bottom-0 inset-x-0 bg-black/75 text-[8px] text-white px-1 py-0.5 truncate">
                    {img.provider} · {img.matchScore}%
                    {img.issues?.[0] ? ` · ${img.issues[0].slice(0, 24)}` : ''}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {followUps && followUps.length > 0 && (
          <div className="px-3 pb-3 flex flex-wrap gap-1.5">
            {followUps.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setPrompt(f);
                  void submit(f);
                }}
                className="text-[10px] px-2 py-1 rounded-full border border-[var(--card-border)] hover:border-[var(--accent)]/40 hover:bg-[var(--accent)]/5"
              >
                {f}
              </button>
            ))}
          </div>
        )}
      </div>

      <ImageEditModal open={editOpen} onClose={() => setEditOpen(false)} src={activeEditSrc} alt={prompt ?? 'Image'} />
    </>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
  accent,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  accent?: 'primary' | 'danger';
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border transition-colors',
        accent === 'primary' &&
          'border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--foreground)] hover:bg-[var(--accent)]/20',
        accent === 'danger' &&
          'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300 hover:bg-red-500/20',
        !accent &&
          'border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] hover:bg-[var(--muted)]/10',
        className
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {label}
    </button>
  );
}
