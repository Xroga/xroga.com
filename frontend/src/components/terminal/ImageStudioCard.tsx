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
  Share2,
  ChevronLeft,
  ChevronRight,
  UserCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { copyImageToClipboard, downloadImage } from '@/lib/imageStudioUtils';
import { setProfileFromImageUrl } from '@/lib/setProfileFromImage';
import { useAvatarUpdate } from '@/hooks/useAvatarUpdate';
import { ImageEditModal } from './ImageEditModal';
import { SocialShareModal } from './SocialShareModal';
import { TextGeneratingAnimation } from './TextGeneratingAnimation';
import { isPlaceholderImage } from '@/lib/parseImageContent';
import { useTerminalChat } from '@/context/TerminalChatContext';
import toast from 'react-hot-toast';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';

export interface RejectedImage {
  imageUrl: string;
  provider: string;
  matchScore: number;
  issues?: string[];
  scoresByVerifier?: Record<string, number>;
  variantLabel?: string;
  variantIndex?: number;
  userVoted?: boolean;
  selected?: boolean;
  failed?: boolean;
  blocked?: boolean;
}

const VARIANT_SLOTS = 4;

const FORMAT_LABELS: Record<string, string> = {
  '1:1': '1:1',
  '4:5': '4:5',
  '16:9': '16:9',
  '9:16': '9:16',
  '3:4': '3:4',
  '4:3': '4:3',
};

function previewAspectClass(aspectFormat?: string, isYoutubeThumbnail?: boolean): string {
  if (aspectFormat === '16:9' || isYoutubeThumbnail) return 'aspect-video';
  if (aspectFormat === '9:16') return 'aspect-[9/16] max-h-72';
  if (aspectFormat === '4:5' || aspectFormat === '3:4') return 'aspect-[4/5] max-h-64';
  return 'aspect-square max-h-56';
}

export interface ImageOutputData {
  type: 'image';
  imageUrl: string;
  provider?: string;
  prompt?: string;
  concisePrompt?: string;
  enhancedPrompt?: string;
  overlayText?: string;
  verified?: boolean;
  matchScore?: number;
  rejectedImages?: RejectedImage[];
  allAttempts?: RejectedImage[];
  isYoutubeThumbnail?: boolean;
  aspectFormat?: string;
  followUps?: string[];
  variantCount?: number;
  isStyleTransfer?: boolean;
  sourceImageUrl?: string;
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
  liveAttempts = [],
  promptHint,
  aspectFormat,
  isYoutubeThumbnail,
}: {
  className?: string;
  message?: string;
  step?: string;
  liveAttempts?: RejectedImage[];
  promptHint?: string;
  aspectFormat?: string;
  isYoutubeThumbnail?: boolean;
}) {
  const slots = Array.from({ length: VARIANT_SLOTS }, (_, i) => liveAttempts[i] ?? null);
  const aspectClass = previewAspectClass(aspectFormat, isYoutubeThumbnail);

  return (
    <div className={cn('my-2', className)}>
      <TextGeneratingAnimation message={message} step={step} mode="image" sublabel="4 variants" />
      {promptHint && (
        <p className="mt-1.5 text-[10px] text-[var(--muted)] truncate px-0.5">{promptHint}</p>
      )}
      <div className="mt-2 grid grid-cols-4 gap-1">
        {slots.map((img, i) => (
          <div
            key={img?.variantIndex ?? `slot-${i}`}
            className={cn(
              'relative overflow-hidden rounded-md border border-[var(--card-border)] bg-[var(--muted)]/10',
              aspectClass,
            )}
          >
            {img ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.imageUrl} alt="" className="h-full w-full object-cover" />
              </>
            ) : (
              <div className="h-full w-full animate-pulse bg-[var(--muted)]/20" />
            )}
          </div>
        ))}
      </div>
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
  const { deleteTurn, updateFeatureOutput } = useTerminalChat();
  const { setAvatarUrl, uploadAvatarFile } = useAvatarUpdate();
  const [settingProfile, setSettingProfile] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [socialOpen, setSocialOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [editSrc, setEditSrc] = useState('');
  const [activeUrl, setActiveUrl] = useState(data.imageUrl);

  const {
    imageUrl: defaultSrc,
    provider,
    prompt,
    concisePrompt,
    enhancedPrompt,
    overlayText,
    verified,
    matchScore,
    rejectedImages,
    allAttempts: allAttemptsProp,
    aspectFormat,
    isStyleTransfer,
    isYoutubeThumbnail,
  } = data;

  const displayPrompt = concisePrompt || enhancedPrompt || prompt;
  const aspectClass = previewAspectClass(aspectFormat, isYoutubeThumbnail);
  const formatBadge =
    isYoutubeThumbnail || aspectFormat === '16:9'
      ? '16:9'
      : aspectFormat
        ? (FORMAT_LABELS[aspectFormat] ?? aspectFormat)
        : '1:1';

  const allAttempts = useMemo(() => {
    if (allAttemptsProp?.length) {
      return [...allAttemptsProp].sort((a, b) => (a.variantIndex ?? 99) - (b.variantIndex ?? 99));
    }
    const list: RejectedImage[] = [];
    const seen = new Set<string>();
    const add = (img: RejectedImage) => {
      if (!img.imageUrl || seen.has(img.imageUrl)) return;
      seen.add(img.imageUrl);
      list.push(img);
    };
    if (defaultSrc && !isPlaceholderImage(defaultSrc)) {
      add({
        imageUrl: defaultSrc,
        provider: provider ?? 'Selected',
        matchScore: matchScore ?? 0,
        selected: true,
      });
    }
    for (const r of rejectedImages ?? []) add(r);
    return list.slice(0, VARIANT_SLOTS);
  }, [defaultSrc, provider, matchScore, rejectedImages, allAttemptsProp]);

  const successfulVariants = useMemo(
    () => allAttempts.filter((v) => Boolean(v.imageUrl) && !v.failed && !v.blocked),
    [allAttempts],
  );

  const allImageUrls = useMemo(
    () => successfulVariants.map((v) => v.imageUrl).filter(Boolean),
    [successfulVariants],
  );

  const visibleVariants =
    successfulVariants.length > 0
      ? successfulVariants
      : allAttempts.filter((v) => !v.failed && !v.blocked);
  const activeVariant = visibleVariants.find((v) => v.imageUrl === activeUrl) ?? visibleVariants[0];
  const previewSrc = activeVariant?.imageUrl ?? defaultSrc;

  const activeIndex = Math.max(
    0,
    successfulVariants.findIndex((v) => v.imageUrl === activeUrl),
  );

  if (generating) {
    return (
      <ImageGeneratingAnimation
        className={className}
        message={message}
        step={step}
        promptHint={displayPrompt}
        aspectFormat={aspectFormat}
        isYoutubeThumbnail={isYoutubeThumbnail}
      />
    );
  }

  if (hidden) return null;

  if (isPlaceholderImage(defaultSrc)) {
    return (
      <div className={cn('my-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2.5 text-center', className)}>
        <p className="text-xs font-medium text-red-600 dark:text-red-300">Generation failed</p>
        <p className="text-[10px] text-[var(--muted)] mt-0.5">Try a clearer prompt.</p>
      </div>
    );
  }

  function persistSelection(url: string, voted: boolean) {
    if (!messageId) return;
    const nextAttempts = allAttempts.map((a) => ({
      ...a,
      selected: a.imageUrl === url,
      userVoted: a.imageUrl === url ? voted : a.userVoted,
    }));
    updateFeatureOutput(messageId, {
      ...data,
      imageUrl: url,
      provider: nextAttempts.find((a) => a.imageUrl === url)?.provider ?? provider,
      matchScore: nextAttempts.find((a) => a.imageUrl === url)?.matchScore ?? matchScore,
      allAttempts: nextAttempts,
    });
  }

  function handleSelect(url: string) {
    setActiveUrl(url);
    persistSelection(url, false);
  }

  function handleDelete() {
    if (messageId) deleteTurn(messageId);
    else onDelete?.();
    setHidden(true);
    setDeleteOpen(false);
  }

  function openEditor(url = previewSrc) {
    setEditSrc(url);
    setActiveUrl(url);
    persistSelection(url, false);
    setEditOpen(true);
  }

  async function handleSetProfilePic(url = previewSrc) {
    setSettingProfile(true);
    try {
      await setProfileFromImageUrl(url, { setAvatarUrl, uploadAvatarFile });
    } catch {
      toast.error('Could not set profile photo — try Download first');
    } finally {
      setSettingProfile(false);
    }
  }

  function slideVariant(delta: number) {
    if (successfulVariants.length < 2) return;
    const next = (activeIndex + delta + successfulVariants.length) % successfulVariants.length;
    const v = successfulVariants[next];
    if (v) handleSelect(v.imageUrl);
  }

  const title = isStyleTransfer ? 'Style' : isYoutubeThumbnail ? 'Thumbnail' : 'Image';

  return (
    <>
      <div
        className={cn(
          'my-2 overflow-hidden rounded-xl border border-[var(--card-border)]/80 bg-[var(--card)]/40 backdrop-blur-sm',
          className,
        )}
      >
        {/* Compact header */}
        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[11px] font-semibold text-[var(--foreground)]">{title}</span>
            <span className="rounded px-1 py-0.5 text-[9px] font-medium bg-[var(--muted)]/15 text-[var(--muted)]">
              {formatBadge}
            </span>
            {successfulVariants.length > 1 && (
              <span className="text-[9px] text-[var(--muted)]">
                {activeIndex + 1}/{successfulVariants.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {verified !== false ? (
              <span className="inline-flex items-center gap-0.5 text-[9px] text-emerald-600">
                <CheckCircle2 className="h-2.5 w-2.5" />
                {activeVariant?.matchScore != null ? `${activeVariant.matchScore}%` : ''}
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 text-[9px] text-amber-600">
                <AlertTriangle className="h-2.5 w-2.5" />
              </span>
            )}
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="p-1 rounded-md text-[var(--muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
              aria-label="Delete"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Hero preview — respects aspect ratio */}
        {previewSrc && (
          <div className="px-2 pb-2">
            <button
              type="button"
              onClick={() => openEditor(previewSrc)}
              className={cn(
                'group relative w-full overflow-hidden rounded-lg bg-black/5 dark:bg-black/20',
                aspectClass,
              )}
              aria-label="Open AI image editor"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewSrc}
                alt={prompt ?? 'Generated image'}
                className="h-full w-full object-cover"
                loading="lazy"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                <Wand2 className="h-5 w-5 text-white opacity-0 group-hover:opacity-90 drop-shadow transition-opacity" />
              </span>
            </button>

            {successfulVariants.length > 1 && (
              <div className="mt-1.5 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => slideVariant(-1)}
                  className="p-0.5 rounded text-[var(--muted)] hover:text-[var(--foreground)]"
                  aria-label="Previous variant"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <div className="flex flex-1 gap-1 overflow-x-auto scrollbar-none">
                  {successfulVariants.map((v, i) => (
                    <button
                      key={`thumb-${v.variantIndex ?? i}`}
                      type="button"
                      onClick={() => handleSelect(v.imageUrl)}
                      className={cn(
                        'shrink-0 w-10 rounded overflow-hidden border-2 transition-colors',
                        v.imageUrl === previewSrc
                          ? 'border-[var(--accent)]'
                          : 'border-transparent opacity-70 hover:opacity-100',
                      )}
                      aria-label={`Variant ${i + 1}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={v.imageUrl} alt="" className="w-full aspect-video object-cover" />
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => slideVariant(1)}
                  className="p-0.5 rounded text-[var(--muted)] hover:text-[var(--foreground)]"
                  aria-label="Next variant"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Icon toolbar */}
            <div className="mt-2 flex items-center justify-between gap-1 px-0.5">
              <div className="flex items-center gap-0.5">
                <IconBtn icon={Wand2} label="AI Edit" onClick={() => openEditor(previewSrc)} accent />
                <IconBtn
                  icon={UserCircle}
                  label="Profile"
                  onClick={() => void handleSetProfilePic(previewSrc)}
                  disabled={settingProfile}
                />
                <IconBtn icon={Share2} label="Share" onClick={() => setSocialOpen(true)} />
                <IconBtn icon={Download} label="Save" onClick={() => downloadImage(previewSrc, 'xroga-image.png')} />
                <IconBtn icon={Copy} label="Copy" onClick={() => copyImageToClipboard(previewSrc)} />
              </div>
            </div>
          </div>
        )}

        {/* Collapsible prompt — one line by default */}
        {displayPrompt && (
          <div className="border-t border-[var(--card-border)]/60 px-2.5 py-1.5">
            <button
              type="button"
              onClick={() => setPromptOpen((o) => !o)}
              className="flex w-full items-center gap-1 text-left"
            >
              <span className="text-[9px] font-medium uppercase tracking-wide text-[var(--muted)] shrink-0">
                Prompt
              </span>
              <span className={cn('flex-1 text-[10px] text-[var(--muted)]', !promptOpen && 'truncate')}>
                {displayPrompt}
                {overlayText && !promptOpen && (
                  <span className="text-[var(--accent)]"> · &ldquo;{overlayText}&rdquo;</span>
                )}
              </span>
              {promptOpen ? (
                <ChevronUp className="h-3 w-3 shrink-0 text-[var(--muted)]" />
              ) : (
                <ChevronDown className="h-3 w-3 shrink-0 text-[var(--muted)]" />
              )}
            </button>
            {promptOpen && overlayText && (
              <p className="mt-1 text-[10px] text-[var(--accent)]">
                On-image text: <span className="font-semibold">&ldquo;{overlayText}&rdquo;</span>
              </p>
            )}
          </div>
        )}
      </div>

      <SocialShareModal
        open={socialOpen}
        onClose={() => setSocialOpen(false)}
        prompt={prompt}
        concisePrompt={concisePrompt}
        overlayText={overlayText}
        imageUrls={allImageUrls}
        primaryImageUrl={previewSrc}
      />

      <ImageEditModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        src={editSrc || previewSrc}
        alt={prompt ?? 'Image'}
        variants={successfulVariants}
        sharePrompt={prompt}
        concisePrompt={concisePrompt}
        overlayText={overlayText}
      />

      <ConfirmDeleteModal
        open={deleteOpen}
        title="Delete this image?"
        message="This permanently removes the image, your prompt, and all variants from chat and AI Media."
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </>
  );
}

function IconBtn({
  icon: Icon,
  label,
  onClick,
  accent,
  disabled,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  accent?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'p-2 rounded-lg transition-colors disabled:opacity-50',
        accent
          ? 'text-[var(--accent)] hover:bg-[var(--accent)]/10'
          : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]/10',
      )}
      aria-label={label}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
