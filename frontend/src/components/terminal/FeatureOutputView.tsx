'use client';

import { ImageStudioCard, type ImageOutputData } from './ImageStudioCard';
import { ImageBlockedCard } from './ImageBlockedCard';
import { VideoStudioCard, type VideoOutputData } from './VideoStudioCard';
import { VideoJobPendingCard } from './VideoJobPendingCard';
import { LandingPageCard } from './LandingPageCard';
import { getSelectedRepoContext } from '@/lib/repoContext';
import type { ImageBlockedOutput } from '@/lib/imageSafetyMessages';

export function FeatureOutputView({
  output,
  onDelete,
  messageId,
  onVideoJobResolved,
  onPreviewUpdate,
}: {
  output: unknown;
  onDelete?: () => void;
  messageId?: string;
  onVideoJobResolved?: (output: VideoOutputData) => void;
  onPreviewUpdate?: (messageId: string, output: unknown) => void;
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
    return <ImageBlockedCard data={data} messageId={messageId} onDelete={onDelete} />;
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

  if (o.type === 'landing_page') {
    const deployUrl = typeof o.deployUrl === 'string' ? o.deployUrl.trim() : '';
    const selectedCtx = typeof window !== 'undefined' ? getSelectedRepoContext() : null;
    const githubRepoUrl =
      typeof o.githubRepoUrl === 'string'
        ? o.githubRepoUrl
        : selectedCtx?.repo
          ? `https://github.com/${selectedCtx.repo}`
          : undefined;
    const githubRepoName =
      typeof o.githubRepoName === 'string'
        ? o.githubRepoName
        : selectedCtx?.repo;
    const hasHtml = typeof o.html === 'string' && o.html.trim().length > 0;
    if (!hasHtml && !deployUrl && !githubRepoUrl) return null;

    const landingData: import('./LandingPageCard').LandingPageOutputData = {
      type: 'landing_page',
      html: typeof o.html === 'string' ? o.html : '',
      css: typeof o.css === 'string' ? o.css : '',
      js: typeof o.js === 'string' ? o.js : '',
      heroImageUrl: typeof o.heroImageUrl === 'string' ? o.heroImageUrl : undefined,
      deployUrl,
      deployVerified: o.deployVerified === true,
      githubRepoUrl,
      githubRepoName,
      projectName: typeof o.projectName === 'string' ? o.projectName : undefined,
      pages: Array.isArray(o.pages) ? (o.pages as string[]) : undefined,
      features: Array.isArray(o.features) ? (o.features as string[]) : undefined,
      designTheme: typeof o.designTheme === 'string' ? o.designTheme : undefined,
      needsPayment: typeof o.needsPayment === 'boolean' ? o.needsPayment : undefined,
      memoryNote: typeof o.memoryNote === 'string' ? o.memoryNote : undefined,
      summary: typeof o.summary === 'string' ? o.summary : undefined,
      vercelPreviewUrl: typeof o.vercelPreviewUrl === 'string' ? o.vercelPreviewUrl : undefined,
      netlifyPreviewUrl: typeof o.netlifyPreviewUrl === 'string' ? o.netlifyPreviewUrl : undefined,
      followUps: Array.isArray(o.followUps) ? (o.followUps as string[]) : undefined,
      generatedFiles: Array.isArray(o.generatedFiles) ? (o.generatedFiles as string[]) : undefined,
      fileCount: typeof o.fileCount === 'number' ? o.fileCount : undefined,
    };

    return (
      <LandingPageCard
        data={landingData}
        onPreviewUpdate={
          messageId && onPreviewUpdate
            ? (next) => onPreviewUpdate(messageId, next)
            : undefined
        }
      />
    );
  }

  if (o.type === 'video_studio' && typeof o.streamingUrl === 'string') {
    const data: VideoOutputData = {
      type: 'video_studio',
      title: typeof o.title === 'string' ? o.title : 'Your video',
      streamingUrl: o.streamingUrl,
      durationSeconds: typeof o.durationSeconds === 'number' ? o.durationSeconds : undefined,
      selectedProvider: typeof o.selectedProvider === 'string' ? o.selectedProvider : undefined,
      videoFormat:
        o.videoFormat === 'shorts_reels' || o.videoFormat === 'youtube_video' ? o.videoFormat : undefined,
      prompt: typeof o.prompt === 'string' ? o.prompt : undefined,
      screenplay: o.screenplay as VideoOutputData['screenplay'],
      providersUsed: Array.isArray(o.providersUsed) ? (o.providersUsed as string[]) : undefined,
      reviewScores: o.reviewScores as VideoOutputData['reviewScores'],
      healingSteps: Array.isArray(o.healingSteps) ? (o.healingSteps as string[]) : undefined,
      qcScore: typeof o.qcScore === 'number' ? o.qcScore : undefined,
      omniReality: o.omniReality as VideoOutputData['omniReality'],
      audioTracks: Array.isArray(o.audioTracks) ? (o.audioTracks as VideoOutputData['audioTracks']) : undefined,
      variants: Array.isArray(o.variants)
        ? (o.variants as Array<{ streamingUrl: string; provider: string; label?: string }>)
        : undefined,
    };
    return <VideoStudioCard data={data} onDelete={onDelete} messageId={messageId} />;
  }

  if (o.type === 'video_job_pending' && typeof o.jobId === 'string') {
    return (
      <VideoJobPendingCard
        jobId={o.jobId}
        message={typeof o.message === 'string' ? o.message : undefined}
        estimatedSeconds={typeof o.estimatedSeconds === 'number' ? o.estimatedSeconds : 120}
        startedAt={typeof o.startedAt === 'number' ? o.startedAt : undefined}
        userPrompt={typeof o.userPrompt === 'string' ? o.userPrompt : undefined}
        messageId={messageId}
        onResolved={(video) => onVideoJobResolved?.(video)}
      />
    );
  }

  return null;
}
