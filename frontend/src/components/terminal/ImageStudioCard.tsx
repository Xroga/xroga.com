'use client';

import type { ComponentType } from 'react';
import { useMemo, useState } from 'react';
import {
  Download,
  Copy,
  Trash2,
  Wand2,
  CheckCircle2,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { copyImageToClipboard, downloadImage } from '@/lib/imageStudioUtils';
import { ImageEditModal } from './ImageEditModal';
import { TextGeneratingAnimation } from './TextGeneratingAnimation';
import { isPlaceholderImage } from '@/lib/parseImageContent';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';

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
  messageId?: string;
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
      <TextGeneratingAnimation message={message} step={step} mode="image" sublabel="Xroga AI · Image Studio" />
    </div>
  );
}

export function ImageStudioCard({
  data,
  messageId,
  onDelete,
  className,
  generating,
  message,
  step,
}: ImageStudioCardProps) {
  const { setPrompt, submit, deleteTurn } = useTerminalChat();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [liked, setLiked] = useState<boolean | null>(null);
  const [editSrc, setEditSrc] = useState('');

  const {
    imageUrl: src,
    provider,
    prompt,
    verified,
    matchScore,
    rejectedImages,
    aspectFormat,
  } = data;

  const allAttempts = useMemo(() => {
    const list: RejectedImage[] = [];
    const seen = new Set<string>();
    const add = (img: RejectedImage) => {
      if (!img.imageUrl || seen.has(img.imageUrl)) return;
      seen.add(img.imageUrl);
      list.push(img);
    };
    if (src && !isPlaceholderImage(src)) {
      add({
        imageUrl: src,
        provider: provider ?? 'Selected',
        matchScore: matchScore ?? 0,
      });
    }
    for (const r of rejectedImages ?? []) add(r);
    return list.sort((a, b) => b.matchScore - a.matchScore);
  }, [src, provider, matchScore, rejectedImages]);

  if (generating) {
    return <ImageGeneratingAnimation className={className} message={message} step={step} />;
  }

  if (hidden) return null;

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
    if (messageId) deleteTurn(messageId);
    else onDelete?.();
    setHidden(true);
    setDeleteOpen(false);
  }

  function handleVariant() {
    const text = `Generate more variants of: ${prompt ?? 'this image'}`;
    setPrompt(text);
    void submit(text);
  }

  function openEditor(url = src) {
    setEditSrc(url);
    setEditOpen(true);
  }

  const formatLabel = aspectFormat ? (FORMAT_LABELS[aspectFormat] ?? aspectFormat) : 'Post (1:1)';

  return (
    <>
      <div
        className={cn(
          'my-3 overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm',
          className,
        )}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--card-border)] bg-[var(--background)]/50">
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            <span className="text-xs font-semibold">Image</span>
            {provider && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--muted)]/10 border border-[var(--card-border)] truncate max-w-[100px]">
                {provider}
              </span>
            )}
            <span className="text-[10px] text-[var(--muted)]">{formatLabel}</span>
            {verified !== false ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600">
                <CheckCircle2 className="h-3 w-3" />
                {matchScore != null ? `${matchScore}%` : 'OK'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600">
                <AlertTriangle className="h-3 w-3" />
                Best effort
              </span>
            )}
          </div>
        </div>

        <div className="p-2 bg-[var(--background)]">
          <button
            type="button"
            onClick={() => openEditor()}
            className="w-full overflow-hidden rounded-lg border border-[var(--card-border)] cursor-zoom-in hover:ring-2 hover:ring-[var(--accent)]/25 transition-shadow"
            aria-label="Open image editor"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={prompt ?? 'Generated image'}
              className={cn(
                'w-full max-h-[360px] object-contain mx-auto transition-opacity duration-500',
                revealed ? 'opacity-100' : 'opacity-0',
              )}
              loading="lazy"
              onLoad={() => setRevealed(true)}
            />
          </button>
        </div>

        <div className="flex items-center gap-1 px-2 py-2 border-t border-[var(--card-border)]">
          <IconBtn
            icon={ThumbsUp}
            title="Like"
            active={liked === true}
            onClick={() => setLiked(true)}
          />
          <IconBtn
            icon={ThumbsDown}
            title="Retry"
            active={liked === false}
            onClick={() => {
              setLiked(false);
              handleVariant();
            }}
          />
          <IconBtn icon={Layers} title="Variants" onClick={handleVariant} />
          <div className="w-px h-5 bg-[var(--card-border)] mx-0.5" />
          <IconBtn icon={Download} title="Download" onClick={() => downloadImage(src, 'xroga-image.png')} />
          <IconBtn icon={Copy} title="Copy" onClick={() => copyImageToClipboard(src)} />
          <IconBtn icon={Wand2} title="Edit" accent onClick={() => openEditor()} />
          <IconBtn
            icon={Trash2}
            title="Delete"
            danger
            className="ml-auto"
            onClick={() => setDeleteOpen(true)}
          />
        </div>

        {allAttempts.length > 1 && (
          <div className="px-2 pb-2 border-t border-[var(--card-border)] pt-2">
            <p className="text-[10px] font-medium text-[var(--muted)] mb-1.5">
              All AI tries ({allAttempts.length}) — tap to edit
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
              {allAttempts.map((img) => {
                const selected = img.imageUrl === src;
                return (
                  <button
                    key={img.imageUrl}
                    type="button"
                    onClick={() => openEditor(img.imageUrl)}
                    className={cn(
                      'relative rounded-md overflow-hidden border text-left aspect-square',
                      selected
                        ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]/40'
                        : 'border-[var(--card-border)] hover:border-[var(--accent)]/35',
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.imageUrl} alt="" className="w-full h-full object-cover" />
                    <span className="absolute bottom-0 inset-x-0 bg-black/75 text-[7px] text-white px-1 py-0.5 truncate">
                      {img.provider}
                      {img.matchScore ? ` · ${img.matchScore}%` : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <ImageEditModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        src={activeEditSrc}
        alt={prompt ?? 'Image'}
        variants={allAttempts}
      />

      <ConfirmDeleteModal
        open={deleteOpen}
        title="Delete this image?"
        message="This permanently removes the image, your prompt, and all AI attempts from chat and AI Media."
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </>
  );
}

function IconBtn({
  icon: Icon,
  title,
  onClick,
  active,
  accent,
  danger,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  onClick: () => void;
  active?: boolean;
  accent?: boolean;
  danger?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'p-2 rounded-lg border transition-colors',
        active && 'border-emerald-500/40 bg-emerald-500/10',
        accent && 'border-[var(--accent)]/35 bg-[var(--accent)]/10',
        danger && 'border-red-500/30 text-red-500 hover:bg-red-500/10',
        !active && !accent && !danger && 'border-transparent hover:bg-[var(--muted)]/10',
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
