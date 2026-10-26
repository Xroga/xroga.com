import type { ProjectFile } from '../ai/patches.js';
import type { CommitFn } from '../synthesis/productionAdapters.js';

/**
 * Supplied to the canonical build pipeline only by trusted server code, after the builder has
 * resolved project ownership from the verified identity. Never read from a request body.
 */
export interface BuilderPipelineBinding {
  readonly projectId: string;
  /** Complete current source revision the build starts from. */
  readonly files: readonly ProjectFile[];
  /** Saves a durable revision once the canonical validation has accepted the result. */
  readonly commit: CommitFn;
}
