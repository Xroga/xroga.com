import type { Phase2Store } from '../phase2Store.js';
import type { BuilderService } from '../service.js';
import { BuilderError } from '../types.js';
import { buildSourceArchive, type BuiltArchive } from './archive.js';

/**
 * Produces a verified source archive for a revision and records that it was produced and verified.
 * The record holds the archive hash and counts, never the archive or any file content.
 */
export class ExportService {
  constructor(
    private readonly deps: { readonly builder: BuilderService; readonly phase2: Phase2Store },
  ) {}

  async exportRevision(userId: string, projectId: string, input: { revisionId?: string; runId: string }): Promise<BuiltArchive & { readonly revisionNumber: number }> {
    const project = await this.deps.builder.requireProject(userId, projectId);
    const revision = input.revisionId ? await this.deps.builder.revisionFiles(userId, projectId, input.revisionId) : (await this.deps.builder.headFiles(userId, project)).revision;
    if (!revision) throw new BuilderError('not_found', 'The project has no source revision to export.');
    // Throws (and returns nothing) if the archive cannot be read back and verified.
    const archive = buildSourceArchive({ projectId, title: project.title, revision, starter: project.starter });
    const saved = await this.deps.phase2.saveVerification(userId, projectId, {
      revisionId: revision.id, runId: input.runId, kind: 'export', status: 'passed', executedChecks: archive.manifest.files.length,
      summary: { sha256: archive.sha256, bytes: archive.bytes, fileCount: archive.manifest.files.length, excluded: archive.manifest.excluded.length, revisionNumber: revision.revisionNumber },
      report: { manifest: archive.manifest },
    });
    if (!saved) throw new BuilderError('storage_failed', 'The export could not be recorded, so it was not provided.');
    return { ...archive, revisionNumber: revision.revisionNumber };
  }
}
