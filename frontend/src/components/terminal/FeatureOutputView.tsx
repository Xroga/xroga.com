'use client';

import { TerminalBuildReport } from './TerminalBuildReport';
import { VIDEO_REMOVED_MESSAGE } from '@/lib/videoRemoved';
import type { FileTrailItem } from '@/store/useProjectWorkspaceStore';
import { deriveLandingOutcome } from '@/lib/landingOutcome';

export function FeatureOutputView({
  output,
  onDelete: _onDelete,
  messageId: _messageId,
  onPreviewUpdate: _onPreviewUpdate,
}: {
  output: unknown;
  onDelete?: () => void;
  messageId?: string;
  onPreviewUpdate?: (messageId: string, output: unknown) => void;
}) {
  void _onDelete;
  void _messageId;
  void _onPreviewUpdate;
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;

  if (o.type === 'video_studio' || o.type === 'video_job_pending') {
    return (
      <p className="text-sm text-[var(--foreground)]/85 py-1">{VIDEO_REMOVED_MESSAGE}</p>
    );
  }

  if (o.type === 'image_blocked' || o.type === 'image') {
    return (
      <p className="text-sm text-[var(--muted)] py-1">
        Legacy image generation has been removed while we rebuild the AI system.
      </p>
    );
  }

  if (o.type === 'landing_page') {
    // Prefer updateTrail on the message; if featureOutput still carries build data, render terminal report (no card).
    const isUpdate = o.isUpdate === true;
    const projectName = typeof o.projectName === 'string' ? o.projectName : 'Project';
    const userPrompt = typeof o.userPrompt === 'string' ? o.userPrompt : undefined;
    const changes = Array.isArray(o.changesSummary)
      ? (o.changesSummary as string[])
      : undefined;
    const files = (
      Array.isArray(o.fileTrail) ? (o.fileTrail as FileTrailItem[]) : []
    )
      .filter((f) => f && typeof f.path === 'string')
      .map((f) => ({
        path: f.path,
        before: typeof f.before === 'string' ? f.before : '',
        after: typeof f.after === 'string' ? f.after : '',
        added: Number(f.added) || 0,
        removed: Number(f.removed) || 0,
      }));

    const outcome = deriveLandingOutcome(o, { projectName, isUpdate });
    const statusLines = [...outcome.statusLines];
    const liveUrl =
      (typeof o.deployUrl === 'string' &&
        /^https:\/\//i.test(o.deployUrl.trim()) &&
        o.deployUrl.trim()) ||
      (typeof o.vercelPreviewUrl === 'string' &&
        /^https:\/\//i.test(o.vercelPreviewUrl.trim()) &&
        o.vercelPreviewUrl.trim()) ||
      '';
    if (o.usedSurgicalPatches) statusLines.push('Patches · surgical SEARCH/REPLACE');
    const envSync = o.envSync as { ok?: boolean; error?: string } | undefined;
    if (envSync && envSync.ok === false) {
      statusLines.push(
        `Env sync · failed${envSync.error ? ` (${String(envSync.error).slice(0, 80)})` : ''}`
      );
    }
    const qa = o.qa as { issues?: string[] } | undefined;

    return (
      <TerminalBuildReport
        headline={outcome.headline}
        projectName={projectName}
        userPrompt={userPrompt}
        changes={changes}
        files={files}
        statusLines={statusLines}
        githubUrl={typeof o.githubRepoUrl === 'string' ? o.githubRepoUrl : null}
        githubLabel={o.githubPushConfirmed === true ? 'GitHub commit' : 'GitHub target · not pushed'}
        deployUrl={liveUrl || null}
        deployLabel={
          o.deployVerified === true ? 'Verified live on Vercel' : 'Open unverified deployment'
        }
        completionNote={outcome.completionNote}
        qaIssues={qa?.issues}
        isUpdate={isUpdate}
      />
    );
  }

  if (o.type === 'chat' && typeof o.content === 'string') {
    return null; // chat content rendered as ModernResponseText
  }

  return null;
}
