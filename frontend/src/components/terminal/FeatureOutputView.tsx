'use client';

import { ImageStudioCard, type ImageOutputData } from './ImageStudioCard';
import { VideoStudioCard, type VideoOutputData } from './VideoStudioCard';

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

  if (o.type === 'image' && typeof o.imageUrl === 'string') {
    const data: ImageOutputData = {
      type: 'image',
      imageUrl: o.imageUrl,
      provider: typeof o.provider === 'string' ? o.provider : undefined,
      prompt: typeof o.prompt === 'string' ? o.prompt : undefined,
      verified: o.verified as boolean | undefined,
      matchScore: typeof o.matchScore === 'number' ? o.matchScore : undefined,
      rejectedImages: Array.isArray(o.rejectedImages) ? (o.rejectedImages as ImageOutputData['rejectedImages']) : undefined,
      allAttempts: Array.isArray(o.allAttempts) ? (o.allAttempts as ImageOutputData['allAttempts']) : undefined,
      isYoutubeThumbnail: Boolean(o.isYoutubeThumbnail),
      aspectFormat: typeof o.aspectFormat === 'string' ? o.aspectFormat : undefined,
      followUps: Array.isArray(o.followUps) ? (o.followUps as string[]) : undefined,
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
