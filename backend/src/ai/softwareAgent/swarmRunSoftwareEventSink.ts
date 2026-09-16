import {
  appendRunEvent,
} from '../runStore.js';

import type {
  SoftwareRunEvent,
  SoftwareRunEventSink,
} from './runEvents.js';

export type SoftwareRunEventObserver =
  (event: SoftwareRunEvent) => void;

/**
 * Bridges Software Agent V2's native execution events into Xroga's existing
 * durable swarm-run history.
 *
 * This deliberately reuses runStore instead of introducing a second run
 * persistence system:
 *
 * Agent V2
 *   -> SoftwareRunEvent
 *   -> swarm_runs.events
 *   -> existing reconnect/polling path
 *   -> frontend
 *
 * The optional mirror preserves an in-memory copy for diagnostics/tests.
 * The optional observer is the hook used by the next batch to push the same
 * event into the live SSE connection without replacing this file again.
 */
export class SwarmRunSoftwareEventSink
  implements SoftwareRunEventSink
{
  constructor(
    private readonly mirror?: SoftwareRunEventSink,
    private readonly observer?: SoftwareRunEventObserver,
  ) {}

  emit(
    event: SoftwareRunEvent,
  ): Promise<void> | void {
    const mirrorResult =
      this.mirror?.emit(event);

    appendRunEvent(
      event.runId,
      'progress',
      {
        agent:
          'builder',

        status:
          event.type,

        message:
          event.title,

        swarmStatusLabel:
          statusLabel(event),

        swarmActivity:
          event.summary ??
          event.title,

        builderVersion:
          'agent-v2',

        softwareAgentV2:
          true,

        softwareEvent: {
          id:
            event.id,

          runId:
            event.runId,

          sequence:
            event.sequence,

          createdAt:
            event.createdAt,

          type:
            event.type,

          status:
            event.status,

          title:
            event.title,

          ...(event.summary
            ? {
                summary:
                  event.summary,
              }
            : {}),

          ...(event.evidence
            ? {
                evidence:
                  event.evidence,
              }
            : {}),
        },
      },
    );

    if (this.observer) {
      try {
        this.observer(event);
      } catch (error) {
        /*
         * A UI observer must never be able to kill an engineering run.
         * Durable persistence above remains authoritative.
         */
        console.warn(
          '[software_agent_v2_event_observer]',
          error instanceof Error
            ? error.message
            : String(error),
        );
      }
    }

    return mirrorResult;
  }
}

function statusLabel(
  event: SoftwareRunEvent,
): string {
  switch (event.type) {
    case 'run.started':
      return 'Starting';

    case 'plan.updated':
      return 'Planning';

    case 'project.inspect.started':
    case 'project.inspect.completed':
      return 'Inspecting';

    case 'file.read':
      return 'Reading';

    case 'file.created':
    case 'file.updated':
    case 'file.deleted':
      return 'Editing';

    case 'command.started':
    case 'command.output':
      return 'Running';

    case 'command.completed':
      return event.evidence?.exitCode === 0
        ? 'Command passed'
        : 'Command finished';

    case 'check.started':
      return 'Checking';

    case 'check.completed':
      return event.evidence?.exitCode === 0
        ? 'Check passed'
        : 'Check finished';

    case 'repair.started':
    case 'repair.completed':
      return 'Repairing';

    case 'preview.starting':
      return 'Starting preview';

    case 'preview.ready':
      return 'Preview ready';

    case 'preview.failed':
      return 'Preview failed';

    case 'browser.verification.started':
      return 'Verifying';

    case 'browser.verification.completed':
      return 'Verified';

    case 'git.branch.created':
    case 'git.commit.created':
      return 'Saving';

    case 'deployment.started':
      return 'Deploying';

    case 'deployment.ready':
      return 'Deployed';

    case 'deployment.failed':
      return 'Deploy failed';

    case 'run.completed':
      return 'Completed';

    case 'run.failed':
      return 'Failed';

    case 'run.cancelled':
      return 'Cancelled';

    default:
      return 'Building';
  }
}
