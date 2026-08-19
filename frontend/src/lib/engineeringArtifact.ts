/**
 * The frontend's view of the engineering artifact contract.
 *
 * Mirrors `backend/src/ai/engineeringArtifact.ts`. Kept as a separate declaration rather than
 * imported across the package boundary because the two deploy independently: a persisted run
 * written by an older backend must still render here, which means this side has to treat every
 * field as potentially absent and say so in the types.
 *
 * `artifactVersion` is what makes that safe. A renderer that meets a version it does not
 * understand declines rather than guessing — for a result that reports whether someone's code
 * was verified, "I cannot display this" is far better than a confident wrong answer.
 */

export const ENGINEERING_ARTIFACT_TYPE = 'engineering_artifact';
/** The highest version this frontend knows how to render. */
export const SUPPORTED_ARTIFACT_VERSION = 1;

export type ArtifactStatus = 'verified' | 'blocked' | 'failed';

export interface ArtifactFileEntry {
  path: string;
  added?: number;
  removed?: number;
  action?: 'created' | 'modified' | 'deleted';
}

export interface ArtifactRepository {
  owner: string;
  repo: string;
  branch: string;
  baseBranch?: string;
  commitSha?: string | null;
  commitVerified?: boolean;
  pullRequestUrl?: string | null;
}

export interface ArtifactVerification {
  phase: string;
  statement: string;
  detail: string;
}

export interface EngineeringArtifact {
  type: typeof ENGINEERING_ARTIFACT_TYPE;
  artifactVersion: number;
  summary: string;
  status: ArtifactStatus;
  verified: boolean;
  outcome: string;
  phaseReached: string;
  reason: string;
  blockers: string[];
  files: ArtifactFileEntry[];
  fileCount: number;
  repository: ArtifactRepository | null;
  commitSha: string | null;
  verificationEvidence: ArtifactVerification[];
  preview: { url?: string | null; verified?: boolean } | null;
  nextAction: string | null;
  /** Present when the run failed after producing the artifact. */
  error?: string;
  code?: string;
}

export function isEngineeringArtifact(value: unknown): value is EngineeringArtifact {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    (value as { type?: unknown }).type === ENGINEERING_ARTIFACT_TYPE &&
    typeof (value as { artifactVersion?: unknown }).artifactVersion === 'number'
  );
}

/** Whether this frontend can render the artifact it was given. */
export function isRenderableArtifact(value: unknown): value is EngineeringArtifact {
  return isEngineeringArtifact(value) && value.artifactVersion <= SUPPORTED_ARTIFACT_VERSION;
}

/**
 * The text form, for transcripts and any surface that cannot render a component.
 *
 * This is the function that replaces `"Swarm task complete."` for engineering runs. It is
 * deliberately substantial: the text fallback is what a user sees in a copied transcript, in
 * search, and in every context where the rich renderer is unavailable, so it has to carry the
 * result rather than gesture at it.
 */
export function engineeringArtifactToText(artifact: EngineeringArtifact): string {
  const lines: string[] = [artifact.summary];

  if (artifact.error) lines.push(`Run error: ${artifact.error}`);

  if (artifact.blockers.length) {
    lines.push('', 'Blockers:');
    for (const blocker of artifact.blockers.slice(0, 8)) lines.push(`- ${blocker}`);
  }

  if (artifact.fileCount > 0) {
    lines.push('', `Files changed (${artifact.fileCount}):`);
    for (const file of artifact.files.slice(0, 20)) lines.push(`- ${file.path}`);
    if (artifact.files.length > 20) lines.push(`- …and ${artifact.files.length - 20} more`);
  }

  if (artifact.repository) {
    const { owner, repo, branch } = artifact.repository;
    lines.push('', `Repository: ${owner}/${repo} (${branch})`);
  }
  if (artifact.commitSha) lines.push(`Commit: ${artifact.commitSha}`);
  if (artifact.preview?.url) lines.push(`Preview: ${artifact.preview.url}`);

  if (artifact.verificationEvidence.length) {
    lines.push('', 'Verification:');
    for (const item of artifact.verificationEvidence.slice(0, 8)) {
      lines.push(`- ${item.phase}: ${item.statement}`);
    }
  }

  if (artifact.nextAction) lines.push('', artifact.nextAction);

  return lines.join('\n');
}
