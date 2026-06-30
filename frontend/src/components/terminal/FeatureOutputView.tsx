'use client';

import { ImageStudioCard, type ImageOutputData } from './ImageStudioCard';
import { ImageBlockedCard } from './ImageBlockedCard';
import { VideoStudioCard, type VideoOutputData } from './VideoStudioCard';
import type { ImageBlockedOutput } from '@/lib/imageSafetyMessages';

export function FeatureOutputView({
  output,
  onDelete,
  messageId,
}: {
  output: unknown;
  onDelete?: () => void;
  messageId?: string;
}) {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;

  if (o.type === 'image_blocked') {
    const data: ImageBlockedOutput = {
      type: 'image_blocked',
      prompt: typeof o.prompt === 'string' ? o.prompt : '',
      reason:
        o.reason === 'prompt_blocked' || o.reason === 'image_blocked' || o.reason === 'verification_failed'
          ? o.reason
          : 'image_blocked',
      detail: typeof o.detail === 'string' ? o.detail : undefined,
      safety: (o.safety as ImageBlockedOutput['safety']) ?? {
        title: 'Image blocked for your protection',
        quranArabic: 'وَلَا تَقْرَبُوا الزِّنَا ۖ إِنَّهُ كَانَ فَاحِشَةً وَسَاءَ سَبِيلًا',
        quranTranslation:
          'And do not approach unlawful sexual intercourse. Indeed, it is ever an immorality and is evil as a way.',
        quranReference: "Qur'an 17:32 (Surah Al-Isra)",
        guidance: [],
        leakFallback: '',
        creativeAlternatives: [],
      },
      followUps: Array.isArray(o.followUps) ? (o.followUps as string[]) : undefined,
    };
    return <ImageBlockedCard data={data} />;
  }

  if (o.type === 'image' && typeof o.imageUrl === 'string') {
    const data: ImageOutputData = {
      type: 'image',
      imageUrl: o.imageUrl,
      provider: typeof o.provider === 'string' ? o.provider : undefined,
      prompt: typeof o.prompt === 'string' ? o.prompt : undefined,
      concisePrompt: typeof o.concisePrompt === 'string' ? o.concisePrompt : undefined,
      enhancedPrompt: typeof o.enhancedPrompt === 'string' ? o.enhancedPrompt : undefined,
      overlayText: typeof o.overlayText === 'string' ? o.overlayText : undefined,
      verified: o.verified as boolean | undefined,
      matchScore: typeof o.matchScore === 'number' ? o.matchScore : undefined,
      rejectedImages: Array.isArray(o.rejectedImages) ? (o.rejectedImages as ImageOutputData['rejectedImages']) : undefined,
      allAttempts: Array.isArray(o.allAttempts) ? (o.allAttempts as ImageOutputData['allAttempts']) : undefined,
      isYoutubeThumbnail: Boolean(o.isYoutubeThumbnail),
      aspectFormat: typeof o.aspectFormat === 'string' ? o.aspectFormat : undefined,
      followUps: Array.isArray(o.followUps) ? (o.followUps as string[]) : undefined,
      variantCount: typeof o.variantCount === 'number' ? o.variantCount : undefined,
      isStyleTransfer: Boolean(o.isStyleTransfer),
      sourceImageUrl: typeof o.sourceImageUrl === 'string' ? o.sourceImageUrl : undefined,
    };
    return <ImageStudioCard data={data} messageId={messageId} onDelete={onDelete} />;
  }

  if (o.type === 'video_studio' && typeof o.streamingUrl === 'string') {
    const data: VideoOutputData = {
      type: 'video_studio',
      title: typeof o.title === 'string' ? o.title : 'Your video',
      streamingUrl: o.streamingUrl,
      durationSeconds: typeof o.durationSeconds === 'number' ? o.durationSeconds : undefined,
      selectedProvider: typeof o.selectedProvider === 'string' ? o.selectedProvider : undefined,
    };
    return <VideoStudioCard data={data} onDelete={onDelete} messageId={messageId} />;
  }

  return null;
}
