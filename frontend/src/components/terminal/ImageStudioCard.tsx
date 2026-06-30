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
import { ImageVariantCarousel } from './ImageVariantCarousel';
import { VariantThumbGrid, previewAspectClass } from './VariantThumbGrid';
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

const CONTENT_LABELS: Record<string, string> = {
  thumbnail: 'Thumbnail',
  logo: 'Logo',
  avatar: 'Avatar',
  og: 'OG Post',
  post: 'Post',
  story: 'Story',
  banner: 'Banner',
  wallpaper: 'Wallpaper',
  general: 'Image',
};

const STYLE_LABELS: Record<string, string> = {
  photorealistic: 'Photo',
  '3d': '3D',
  pixel: 'Pixel',
  minecraft: 'Minecraft',
  cartoon: 'Cartoon',
  anime: 'Anime',
  logo: 'Logo',
  illustration: 'Illustration',
  general: '',
};

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
  contentType?: string;
  styleVibe?: string;
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
  contentType,
}: {
  className?: string;
  message?: string;
  step?: string;
  liveAttempts?: RejectedImage[];
  promptHint?: string;
  aspectFormat?: string;
  isYoutubeThumbnail?: boolean;
  contentType?: string;
}) {
  const slots = Array.from({ length: VARIANT_SLOTS }, (_, i) => liveAttempts[i] ?? null);
  const thumbH =
    aspectFormat === '16:9' || isYoutubeThumbnail || contentType === 'thumbnail'
      ? 'h-[42px]'
      : aspectFormat === '9:16' || contentType === 'story'
        ? 'h-[52px]'
        : 'h-14';

  return (
    <div className={cn('my-2', className)}>
      <TextGeneratingAnimation message={message} step={step} mode="image" sublabel="4 variants" />
      {promptHint && <p className="mt-1.5 text-[10px] text-[var(--muted)] truncate px-0.5">{promptHint}</p>}
      <div className="mt-2 grid grid-cols-4 gap-1">
        {slots.map((img, i) => (
          <div
            key={img?.variantIndex ?? `slot-${i}`}
            className={cn('relative overflow-hidden rounded-md border border-[var(--card-border)] bg-[var(--muted)]/10', thumbH)}
          >
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img.imageUrl} alt="" className="h-full w-full object-contain p-0.5" />
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
  const [downloading, setDownloading] = useState(false);
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
    contentType,
    styleVibe,
    isStyleTransfer,
    isYoutubeThumbnail,
  } = data;

  const displayPrompt = concisePrompt || enhancedPrompt || prompt;
  const aspectClass = previewAspectClass(aspectFormat, isYoutubeThumbnail, contentType);
  const title = isStyleTransfer ? 'Style' : CONTENT_LABELS[contentType ?? ''] ?? (isYoutubeThumbnail ? 'Thumbnail' : 'Image');
  const styleBadge = styleVibe ? STYLE_LABELS[styleVibe] : '';
  const formatBadge = aspectFormat ?? (isYoutubeThumbnail ? '16:9' : '1:1');

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
      add({ imageUrl: defaultSrc, provider: provider ?? 'Selected', matchScore: matchScore ?? 0, selected: true });
    }
    for (const r of rejectedImages ?? []) add(r);
    return list.slice(0, VARIANT_SLOTS);
  }, [defaultSrc, provider, matchScore, rejectedImages, allAttemptsProp]);

  const successfulVariants = useMemo(
    () => allAttempts.filter((v) => Boolean(v.imageUrl) && !v.failed && !v.blocked),
    [allAttempts],
  );

  const allImageUrls = useMemo(() => successfulVariants.map((v) => v.imageUrl).filter(Boolean), [successfulVariants]);

  const visibleVariants =
    successfulVariants.length > 0 ? successfulVariants : allAttempts.filter((v) => !v.failed && !v.blocked);
  const activeVariant = visibleVariants.find((v) => v.imageUrl === activeUrl) ?? visibleVariants[0];
  const previewSrc = activeVariant?.imageUrl ?? defaultSrc;

  const activeIndex = Math.max(0, visibleVariants.findIndex((v) => v.imageUrl === activeUrl));
  const carouselSlides = visibleVariants.map((v) => ({
    imageUrl: v.imageUrl,
    label: v.variantLabel ?? v.provider,
  }));

  if (generating) {
    return (
      <ImageGeneratingAnimation
        className={className}
        message={message}
        step={step}
        promptHint={displayPrompt}
        aspectFormat={aspectFormat}
        isYoutubeThumbnail={isYoutubeThumbnail}
        contentType={contentType}
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

  function persistSelection(url: string, attempts = allAttempts) {
    if (!messageId) return;
    const nextAttempts = attempts.map((a) => ({
      ...a,
      selected: a.imageUrl === url,
    }));
    updateFeatureOutput(messageId, {
      ...data,
      imageUrl: url,
      provider: nextAttempts.find((a) => a.imageUrl === url)?.provider ?? provider,
      matchScore: nextAttempts.find((a) => a.imageUrl === url)?.matchScore ?? matchScore,
      allAttempts: nextAttempts,
    });
  }

  function handleCarouselChange(index: number) {
    const v = visibleVariants[index];
    if (!v) return;
    setActiveUrl(v.imageUrl);
    persistSelection(v.imageUrl);
  }

  function handleDelete() {
    if (messageId) deleteTurn(messageId);
    else onDelete?.();
    setHidden(true);
    setDeleteOpen(false);
  }

  function openEditor(url = previewSrc) {
    setEditSrc(url);
    setEditOpen(true);
  }

  function handleRemoveVariant(url: string) {
    const next = successfulVariants.filter((v) => v.imageUrl !== url);
    if (next.length === 0) {
      handleDelete();
      return;
    }
    const nextUrl = next[0]!.imageUrl;
    setActiveUrl(nextUrl);
    persistSelection(nextUrl, next);
    toast.success('Variant removed');
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

  async function handleDownload(url = previewSrc) {
    setDownloading(true);
    try {
      await downloadImage(url, 'xroga-image.png');
    } finally {
      setTimeout(() => setDownloading(false), 800);
    }
  }

  return (
    <>
      <div
        className={cn(
          'my-2 overflow-hidden rounded-2xl border border-[var(--card-border)]/80 bg-[var(--card)]/50 backdrop-blur-sm shadow-sm',
          className,
        )}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            <span className="text-xs font-semibold">{title}</span>
            <span className="rounded-md px-1.5 py-0.5 text-[9px] font-medium bg-[var(--muted)]/12 text-[var(--muted)]">
              {formatBadge}
            </span>
            {styleBadge && (
              <span className="rounded-md px-1.5 py-0.5 text-[9px] font-medium bg-[var(--accent)]/10 text-[var(--accent)]">
                {styleBadge}
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
              className="p-1 rounded-md text-[var(--muted)] hover:text-red-500 hover:bg-red-500/10"
              aria-label="Delete"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>

        {previewSrc && (
          <div className="px-3 pb-3 space-y-2.5">
            <ImageVariantCarousel
              slides={carouselSlides.length > 0 ? carouselSlides : [{ imageUrl: previewSrc }]}
              activeIndex={activeIndex}
              onChange={handleCarouselChange}
              aspectClass={aspectClass}
              alt={prompt ?? 'Generated image'}
              onImageClick={openEditor}
            />

            <VariantThumbGrid
              variants={successfulVariants}
              activeUrl={previewSrc}
              aspectFormat={aspectFormat}
              isYoutubeThumbnail={isYoutubeThumbnail}
              contentType={contentType}
              onEdit={openEditor}
              onCopy={(url) => void copyImageToClipboard(url)}
              onDownload={(url) => void handleDownload(url)}
              onRemove={handleRemoveVariant}
            />

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleDownload(previewSrc)}
                disabled={downloading}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-semibold transition-all',
                  'bg-[var(--accent)] text-white hover:opacity-90 active:scale-95',
                  downloading && 'animate-pulse opacity-80',
                )}
              >
                <Download className={cn('h-3.5 w-3.5', downloading && 'animate-bounce')} />
                {downloading ? 'Saving…' : 'Download'}
              </button>

              <button
                type="button"
                onClick={() => setSocialOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-semibold border border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-all active:scale-95"
              >
                <Share2 className="h-3.5 w-3.5" />
                Post to social media
              </button>

              <div className="flex items-center gap-0.5 ml-auto">
                <IconBtn icon={Wand2} label="AI Edit" onClick={() => openEditor(previewSrc)} accent />
                <IconBtn
                  icon={UserCircle}
                  label="Profile"
                  onClick={() => void handleSetProfilePic(previewSrc)}
                  disabled={settingProfile}
                />
                <IconBtn icon={Copy} label="Copy image" onClick={() => void copyImageToClipboard(previewSrc)} />
              </div>
            </div>
          </div>
        )}

        {displayPrompt && (
          <div className="border-t border-[var(--card-border)]/60 px-3 py-2">
            <button type="button" onClick={() => setPromptOpen((o) => !o)} className="flex w-full items-center gap-1 text-left">
              <span className="text-[9px] font-medium uppercase tracking-wide text-[var(--muted)] shrink-0">Prompt</span>
              <span className={cn('flex-1 text-[10px] text-[var(--muted)]', !promptOpen && 'truncate')}>
                {displayPrompt}
                {overlayText && !promptOpen && <span className="text-[var(--accent)]"> · &ldquo;{overlayText}&rdquo;</span>}
              </span>
              {promptOpen ? <ChevronUp className="h-3 w-3 shrink-0 text-[var(--muted)]" /> : <ChevronDown className="h-3 w-3 shrink-0 text-[var(--muted)]" />}
            </button>
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
        contentType={contentType}
        aspectFormat={aspectFormat}
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
        accent ? 'text-[var(--accent)] hover:bg-[var(--accent)]/10' : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]/10',
      )}
      aria-label={label}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
