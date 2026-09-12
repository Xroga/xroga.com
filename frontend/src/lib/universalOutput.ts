export interface UniversalArtifact {
  id: string;
  name: string;
  mediaType: string;
  sizeBytes: number;
  uri?: string;
  inline?: string;
  preview?: { kind: string; data?: Record<string, unknown> };
  validation: Array<{ validator: string; status: 'passed' | 'failed' | 'not_checked'; detail: string }>;
}

export interface UniversalOutput {
  type: 'xroga.output';
  version: '1.0';
  status: 'completed' | 'blocked' | 'failed' | 'partial';
  summary: string;
  artifacts: UniversalArtifact[];
  blockers: string[];
  nextActions: string[];
  evidence?: Array<{ kind: string; detail: string }>;
  provenance?: { runId: string; taskSessionId?: string; projectContextKey?: string };
}

export function isUniversalOutput(value: unknown): value is UniversalOutput {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return row.type === 'xroga.output' && row.version === '1.0' &&
    typeof row.summary === 'string' && Array.isArray(row.artifacts) &&
    row.artifacts.every((item) => item && typeof item === 'object' &&
      typeof (item as Record<string, unknown>).mediaType === 'string');
}

export function artifactPresentation(artifact: UniversalArtifact): 'image' | 'audio' | 'video' | 'text' | 'download' {
  if (artifact.mediaType.startsWith('image/')) return 'image';
  if (artifact.mediaType.startsWith('audio/')) return 'audio';
  if (artifact.mediaType.startsWith('video/')) return 'video';
  if (artifact.mediaType.startsWith('text/') || artifact.mediaType.endsWith('+json') || artifact.mediaType === 'application/json') return 'text';
  return 'download';
}

export function safeArtifactUri(uri?: string): string | null {
  if (!uri) return null;
  if (uri.startsWith('/') || uri.startsWith('./') || uri.startsWith('../') || uri.startsWith('blob:')) return uri;
  try {
    const value = new URL(uri);
    return ['https:', 'http:'].includes(value.protocol) ? uri : null;
  } catch {
    return null;
  }
}
