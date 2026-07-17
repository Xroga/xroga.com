'use client';

import { LandingPageCard } from './LandingPageCard';
import { VIDEO_REMOVED_MESSAGE } from '@/lib/videoRemoved';

export function FeatureOutputView({
  output,
  onDelete,
  messageId,
  onPreviewUpdate,
}: {
  output: unknown;
  onDelete?: () => void;
  messageId?: string;
  onPreviewUpdate?: (messageId: string, output: unknown) => void;
}) {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;

  if (o.type === 'video_studio' || o.type === 'video_job_pending') {
    return (
      <p className="text-sm text-[var(--foreground)]/85 rounded-lg border border-[var(--card-border)] p-3">
        {VIDEO_REMOVED_MESSAGE}
      </p>
    );
  }

  if (o.type === 'image_blocked' || o.type === 'image') {
    return (
      <p className="text-sm text-[var(--muted)] rounded-lg border border-[var(--card-border)] p-3">
        Legacy image generation has been removed while we rebuild the AI system.
      </p>
    );
  }

  if (o.type === 'landing_page') {
    // Plan A: incremental updates render as UpdateFileTrail on the message — not a new card.
    if (o.isUpdate === true) return null;

    const deployUrl = typeof o.deployUrl === 'string' ? o.deployUrl.trim() : '';
    const githubRepoUrl = typeof o.githubRepoUrl === 'string' ? o.githubRepoUrl : undefined;
    const githubRepoName = typeof o.githubRepoName === 'string' ? o.githubRepoName : undefined;
    const githubPushConfirmed = o.githubPushConfirmed === true;
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
      githubPushConfirmed,
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
      userPrompt: typeof o.userPrompt === 'string' ? o.userPrompt : undefined,
      isUpdate: o.isUpdate === true,
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

  return null;
}
