import {
  appendRunEvent,
} from '../runStore.js';

import type {
  SoftwareRunEvent,
  SoftwareRunEventSink,
} from './runEvents.js';

export type SoftwareRunEventObserver =
  (event: SoftwareRunEvent) => void;

export type SoftwareRunProgressData = {
  agent: 'builder';
  status: SoftwareRunEvent['type'];
  message: string;

  swarmStatusLabel: string;
  swarmActivity: string;

  builderVersion: 'agent-v2';
  softwareAgentV2: true;

  softwareEvent: SoftwareRunEvent;
} & Record<string, unknown>;

/**
 * Convert the native Software Agent V2 event into the existing Xroga
 * pipeline progress contract.
 *
 * This object can travel through:
 *
 * Agent V2
 *   -> pipeline.emit(...)
 *   -> /api/swarm onProgress
 *   -> appendRunEvent(...)
 *   -> live SSE
 *   -> frontend
 */
export function softwareRunEventToProgress(
  event: SoftwareRunEvent,
): SoftwareRunProgressData {
  return {
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

    softwareEvent:
      event,
  };
}

/**
 * Software Agent V2 event sink.
 *
 * IMPORTANT:
 *
 * When an observer exists, that observer is the authoritative live delivery
 * path. In production that observer forwards into pipeline.emit(), whose
 * existing /api/swarm onProgress handler already persists the event and
 * sends it over SSE.
 *
 * Therefore we MUST NOT persist here as well when the observer succeeds,
 * otherwise every Agent V2 event would appear twice.
 *
 * When no observer exists — for example a non-streamed execution — this sink
 * falls back to direct runStore persistence so the evidence is still durable.
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

    let observerDelivered =
      false;

    if (this.observer) {
      try {
        this.observer(event);

        observerDelivered =
          true;
      } catch (error) {
        console.warn(
          '[software_agent_v2_event_observer]',
          error instanceof Error
            ? error.message
            : String(error),
        );
      }
    }

    /*
     * No observer means there is no outer live pipeline responsible for
     * persistence.
     *
     * Observer failure also falls back here so execution evidence is not
     * silently lost.
     */
    if (!observerDelivered) {
      appendRunEvent(
        event.runId,
        'progress',
        softwareRunEventToProgress(
          event,
        ),
      );
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
