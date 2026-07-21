'use client';

import { TerminalBuildReport } from './TerminalBuildReport';
import { VIDEO_REMOVED_MESSAGE } from '@/lib/videoRemoved';
import type { FileTrailItem } from '@/store/useProjectWorkspaceStore';

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

    const statusLines: string[] = [];
    if (o.githubPushConfirmed && typeof o.githubRepoName === 'string') {
      statusLines.push(`GitHub · ${o.githubRepoName}`);
    } else if (typeof o.githubRepoName === 'string' && o.githubRepoName.includes('/')) {
      statusLines.push(`GitHub target · ${o.githubRepoName}`);
    }
    if (o.deployVerified && typeof o.deployUrl === 'string' && o.deployUrl) {
      statusLines.push(`Vercel · live`);
    } else if (typeof o.scaffoldKind === 'string' && /^(expo|chrome|electron)$/.test(o.scaffoldKind)) {
      statusLines.push(`Ship · ${o.scaffoldKind} (non-web — see GitHub / Publish)`);
    } else {
      statusLines.push('Preview · sandbox panel');
    }
    if (o.usedSurgicalPatches) statusLines.push('Patches · surgical SEARCH/REPLACE');
    const envSync = o.envSync as { ok?: boolean; error?: string } | undefined;
    if (envSync && envSync.ok === false) {
      statusLines.push(
        `Env sync · failed${envSync.error ? ` (${String(envSync.error).slice(0, 80)})` : ''}`
      );
    }
    const blockers = Array.isArray(o.shipBlockers)
      ? (o.shipBlockers as string[]).filter((b) => typeof b === 'string' && b.trim())
      : [];
    for (const b of blockers.slice(0, 3)) {
      statusLines.push(`Blocker · ${b}`);
    }

    const qa = o.qa as { issues?: string[] } | undefined;

    return (
      <TerminalBuildReport
        headline={isUpdate ? `Updated ${projectName}` : `${projectName} ready`}
        projectName={projectName}
        userPrompt={userPrompt}
        changes={changes}
        files={files}
        statusLines={statusLines}
        githubUrl={typeof o.githubRepoUrl === 'string' ? o.githubRepoUrl : null}
        deployUrl={
          o.deployVerified && typeof o.deployUrl === 'string' ? o.deployUrl : null
        }
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
