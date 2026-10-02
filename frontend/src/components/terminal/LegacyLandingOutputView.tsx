'use client';

import { TerminalBuildReport } from './TerminalBuildReport';
import type { FileTrailItem } from '@/store/useProjectWorkspaceStore';
import { deriveLandingOutcome } from '@/lib/landingOutcome';

export function LegacyLandingOutputView({ output }: { output: Record<string, unknown> }) {
  const isUpdate = output.isUpdate === true;
  const projectName = typeof output.projectName === 'string' ? output.projectName : 'Project';
  const userPrompt = typeof output.userPrompt === 'string' ? output.userPrompt : undefined;
  const changes = Array.isArray(output.changesSummary) ? output.changesSummary as string[] : undefined;
  const files = (Array.isArray(output.fileTrail) ? output.fileTrail as FileTrailItem[] : [])
    .filter((file) => file && typeof file.path === 'string')
    .map((file) => ({
      path: file.path,
      before: typeof file.before === 'string' ? file.before : '',
      after: typeof file.after === 'string' ? file.after : '',
      added: Number(file.added) || 0,
      removed: Number(file.removed) || 0,
    }));
  const outcome = deriveLandingOutcome(output, { projectName, isUpdate });
  const statusLines = [...outcome.statusLines];
  const liveUrl =
    (typeof output.deployUrl === 'string' && /^https:\/\//i.test(output.deployUrl.trim()) && output.deployUrl.trim()) ||
    (typeof output.vercelPreviewUrl === 'string' && /^https:\/\//i.test(output.vercelPreviewUrl.trim()) && output.vercelPreviewUrl.trim()) || '';
  if (output.usedSurgicalPatches) statusLines.push('Patches · surgical SEARCH/REPLACE');
  const envSync = output.envSync as { ok?: boolean; error?: string } | undefined;
  if (envSync?.ok === false) statusLines.push(`Env sync · failed${envSync.error ? ` (${String(envSync.error).slice(0, 80)})` : ''}`);
  const qa = output.qa as { issues?: string[] } | undefined;

  return (
    <TerminalBuildReport
      headline={outcome.headline}
      projectName={projectName}
      userPrompt={userPrompt}
      changes={changes}
      files={files}
      statusLines={statusLines}
      githubUrl={typeof output.githubRepoUrl === 'string' ? output.githubRepoUrl : null}
      githubLabel={output.githubPushConfirmed === true ? 'GitHub commit' : 'GitHub target · not pushed'}
      deployUrl={liveUrl || null}
      deployLabel={output.deployVerified === true ? 'Verified live on Vercel' : 'Open unverified deployment'}
      completionNote={outcome.completionNote}
      qaIssues={qa?.issues}
      isUpdate={isUpdate}
    />
  );
}
