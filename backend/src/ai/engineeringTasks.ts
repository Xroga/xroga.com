/**
 * Real handlers for the engineering task graph.
 *
 * Phase 0 archaeology found the highest-priority architectural defect in the system:
 * `pipeline.ts` pushed engineering tasks into canonical state and then marked two of them
 * completed by hand —
 *
 *     transitionTask(executionState, task.id, 'completed', { evidence: [{
 *       summary: `Inspected ${prior.files.length} project files` ...
 *     }] });
 *
 * — with an evidence sentence the pipeline composed itself. No handler ran. A task was
 * recorded as completed describing work nothing performed, which is the precise shape of
 * unearned evidence the universal path exists to prevent.
 *
 * The fix is not a new mechanism. `ExecutionScheduler` already refuses to complete a task
 * without evidence:
 *
 *     task.status = result.validated && !missingEvidence ? 'completed' : 'failed';
 *
 * That guarantee was simply being bypassed. This module supplies the handlers so the
 * scheduler runs these tasks for real, and evidence is derived from the artifact rather
 * than written about it: each record carries a content hash of the actual object it
 * describes, so a summary cannot drift from what was observed.
 *
 * Task classes with no handler here are left to the scheduler, which blocks them with
 * `no handler for <class>`. That is deliberate and truthful: the canonical runtime does
 * not yet perform implementation — the legacy whole-project builder does — and recording
 * those tasks as blocked states the real position instead of claiming work that the
 * canonical runtime did not do. Replacing that blocker with genuine execution is the next
 * slice of the migration, and it is visible in the run record until then.
 */

import { createHash, randomUUID } from 'node:crypto';
import type { ProjectFile } from './patches.js';
import type { ExecutionEvidence, TaskHandler } from './executionRuntime.js';

function contentHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/**
 * Evidence bound to the artifact it describes.
 *
 * The identifier is a hash of the real object, so a record cannot claim something the
 * artifact does not contain — the failure mode that produced hand-written summaries in
 * the first place.
 */
function evidenceFor(kind: string, summary: string, artifact: unknown): ExecutionEvidence {
  return {
    id: randomUUID(),
    kind,
    summary,
    identifier: `sha256:${contentHash(artifact)}`,
    timestamp: new Date().toISOString(),
  };
}

export interface EngineeringTaskInputs {
  /** The classification the router actually produced for this request. */
  classification: {
    readonly requiresCoding: boolean;
    readonly requiredCapabilities: readonly string[];
  };
  /** The project files actually loaded for this run. */
  files: readonly ProjectFile[];
  /** The repository this run targets, when one is connected. */
  repository: string | null;
}

/**
 * Handlers keyed by `operationType`, which the scheduler uses to dispatch.
 *
 * Only classes whose work genuinely happened before this point are handled. Both consume
 * the real artifact produced upstream rather than re-deriving or asserting it.
 */
export function engineeringTaskHandlers(inputs: EngineeringTaskInputs): Record<string, TaskHandler> {
  return {
    request_understanding: async () => {
      const { classification } = inputs;
      const capabilities = [...classification.requiredCapabilities];
      // Validation is a real property of the artifact: a classification that named no
      // capability at all did not understand the request, and must not pass.
      const validated = capabilities.length > 0;
      return {
        output: { requiresCoding: classification.requiresCoding, requiredCapabilities: capabilities },
        evidence: [
          evidenceFor(
            'request_understanding',
            `Classified the request as ${classification.requiresCoding ? 'coding' : 'non-coding'} ` +
              `requiring ${capabilities.length} capabilities: ${capabilities.join(', ') || 'none'}`,
            classification,
          ),
        ],
        validated,
      };
    },

    repository_analysis: async () => {
      const { files, repository } = inputs;
      const paths = files.map((file) => file.path).sort();
      // Zero files is a real and valid observation for a new project, so it validates —
      // but the evidence says so explicitly rather than implying files were inspected.
      const summary = paths.length
        ? `Read ${paths.length} existing files from ${repository ?? 'the working set'}`
        : `Found no existing files${repository ? ` in ${repository}` : ''}; this is a new project`;
      return {
        output: { repository, fileCount: paths.length, paths },
        evidence: [evidenceFor('repository_analysis', summary, { repository, paths })],
        validated: true,
      };
    },
  };
}

/**
 * The task classes this module can execute today.
 *
 * Exported so tests can assert the boundary explicitly instead of inferring it, and so a
 * class added to the handler map without a corresponding test is visible.
 */
export const HANDLED_TASK_CLASSES = ['request_understanding', 'repository_analysis'] as const;
