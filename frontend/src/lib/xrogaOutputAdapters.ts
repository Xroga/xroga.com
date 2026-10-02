import { isRenderableArtifact, type EngineeringArtifact } from './engineeringArtifact';
import { isUniversalOutput, safeArtifactUri, type UniversalOutput } from './universalOutput';
import { parseXrogaBlock, parseXrogaOutput, type XrogaBlock, type XrogaEvidence, type XrogaOutputDocument } from './xrogaBlocks';

function id(prefix: string, index = 0): string {
  return `${prefix}-${index}`;
}

function universalEvidence(output: UniversalOutput): XrogaEvidence[] {
  return (output.evidence ?? []).map((evidence, index) => ({
    id: id('evidence', index),
    type: 'artifact',
    title: evidence.kind,
    summary: evidence.detail,
    relatedArtifactIds: output.artifacts.map((artifact) => artifact.id),
  }));
}

export function universalOutputToXrogaBlocks(output: UniversalOutput): XrogaBlock[] {
  const blocks: XrogaBlock[] = [{
    schemaVersion: 1,
    id: 'summary',
    type: 'narrative',
    text: output.summary,
  }];

  output.artifacts.forEach((artifact) => {
    blocks.push({
      schemaVersion: 1,
      id: artifact.id,
      type: 'artifact',
      name: artifact.name,
      mediaType: artifact.mediaType,
      uri: safeArtifactUri(artifact.uri) ?? undefined,
      inline: artifact.inline,
      metadataOnly: !artifact.inline && !safeArtifactUri(artifact.uri),
    });
  });

  universalEvidence(output).forEach((evidence) => blocks.push({
    schemaVersion: 1,
    id: `block-${evidence.id}`,
    type: 'evidence',
    evidence,
  }));

  output.blockers.forEach((blocker, index) => blocks.push({
    schemaVersion: 1,
    id: id('blocker', index),
    type: 'error',
    text: blocker,
    tone: 'danger',
  }));

  return blocks;
}

export function engineeringArtifactToXrogaBlocks(artifact: EngineeringArtifact): XrogaBlock[] {
  const blocks: XrogaBlock[] = [{
    schemaVersion: 1,
    id: `engineering-${artifact.softwareProject?.projectId ?? artifact.buildContract?.projectId ?? 'result'}`,
    type: 'website',
    artifactKind: 'engineering',
    artifact,
  }];

  artifact.verificationEvidence.forEach((item, index) => blocks.push({
    schemaVersion: 1,
    id: id('verification', index),
    type: 'evidence',
    evidence: {
      id: id('verification-evidence', index),
      type: 'check',
      title: item.statement,
      summary: item.detail,
      source: item.phase,
    },
  }));

  return blocks;
}

export function legacyFeatureOutputToXrogaBlocks(output: Record<string, unknown>): XrogaBlock[] | null {
  if (output.type === 'landing_page') {
    return [{
      schemaVersion: 1,
      id: 'legacy-landing-result',
      type: 'website',
      artifactKind: 'legacy-landing',
      artifact: output,
    }];
  }

  if (output.type === 'video_studio' || output.type === 'video_job_pending') {
    return [{ schemaVersion: 1, id: 'video-retired', type: 'notice', tone: 'info', text: 'Video generation is not available in this workspace.' }];
  }

  if (output.type === 'image_blocked' || output.type === 'image') {
    return [{ schemaVersion: 1, id: 'image-retired', type: 'notice', tone: 'info', text: 'Legacy image generation is not available in this workspace.' }];
  }

  return null;
}

export function adaptOutputToXrogaDocument(value: unknown): XrogaOutputDocument | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const canonical = parseXrogaOutput(value);
  if (canonical) return canonical;
  if (row.schemaVersion === 1 && typeof row.id === 'string' && Array.isArray(row.blocks)) {
    const status = ['completed', 'partial', 'blocked', 'failed'].includes(String(row.status))
      ? row.status as XrogaOutputDocument['status']
      : 'partial';
    const blocks = row.blocks.map((block, index) => parseXrogaBlock(block) ?? ({
      schemaVersion: 1,
      id: `unsupported-${index}`,
      type: 'empty-state',
      title: 'Output not previewable',
      text: 'This saved output uses a block type this client does not support yet.',
      tone: 'neutral',
    } as const));
    return { schemaVersion: 1, id: row.id, status, blocks };
  }
  const direct = isUniversalOutput(value) ? value : isUniversalOutput(row.outputEnvelope) ? row.outputEnvelope : null;
  if (direct) return { schemaVersion: 1, id: `output-${direct.provenance?.runId ?? 'result'}`, status: direct.status, blocks: universalOutputToXrogaBlocks(direct) };
  if (isRenderableArtifact(value)) return { schemaVersion: 1, id: `artifact-${value.softwareProject?.projectId ?? 'result'}`, status: value.status === 'verified' ? 'completed' : value.status, blocks: engineeringArtifactToXrogaBlocks(value) };
  const legacy = legacyFeatureOutputToXrogaBlocks(row);
  return legacy ? { schemaVersion: 1, id: 'legacy-output', status: 'completed', blocks: legacy } : null;
}
