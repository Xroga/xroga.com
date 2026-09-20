/**
 * The single backend → terminal translation point.
 *
 * Every raw SSE payload enters here and leaves as zero or more TerminalEvent
 * rows.
 *
 * Software Agent V2 events are also normalized here. React components never
 * need to understand the raw Agent V2 wire contract.
 */

import type {
  TerminalEvent,
  TerminalEventKind,
  TerminalEventLevel,
} from './terminalEvent';

import type {
  SoftwareRunEvent,
  SoftwareRunEventEvidence,
  SoftwareRunEventType,
  SoftwareRunStatus,
} from '../swarm';

import {
  redactTerminalText,
} from './terminalRedaction';

import {
  capacityUnavailableLine,
} from '../capacityMessage';

/**
 * Raw payload as received from the network.
 *
 * It is deliberately loose because SSE data is untrusted runtime input.
 */
export type RawTerminalPayload =
  Record<string, unknown>;

export interface AdapterContext {
  /**
   * Sequence number of the last terminal row emitted.
   */
  fromSeq: number;

  /**
   * Receipt time, injected so tests are deterministic.
   */
  now?: number;
}

const SOFTWARE_EVENT_TYPES:
  ReadonlySet<string> =
  new Set([
    'run.started',
    'run.completed',
    'run.failed',
    'run.cancelled',

    'plan.updated',

    'project.inspect.started',
    'project.inspect.completed',

    'file.read',
    'file.created',
    'file.updated',
    'file.deleted',

    'command.started',
    'command.output',
    'command.completed',

    'check.started',
    'check.completed',

    'repair.started',
    'repair.completed',

    'preview.starting',
    'preview.ready',
    'preview.failed',

    'browser.verification.started',
    'browser.verification.completed',

    'git.branch.created',
    'git.commit.created',

    'deployment.started',
    'deployment.ready',
    'deployment.failed',

        'goal.resolved',
    'product.classified',
    'recipe.selected',
    'architecture.selected',
    'file_plan.created',

    'workspace.created',
    'checkpoint.created',

    'file.renamed',

    'dependency.install.started',
    'dependency.install.completed',

    'runtime.started',
    'runtime.stopped',

    'process.started',
    'process.stopped',

    'verification.started',
    'verification.completed',

    'publication.started',
    'publication.completed',

    'delivery.ready',
    
  ]);

const SOFTWARE_STATUSES:
  ReadonlySet<string> =
  new Set([
    'pending',
    'running',
    'success',
    'failed',
    'cancelled',
  ]);

function isRecord(
  value: unknown,
): value is Record<
  string,
  unknown
> {
  return Boolean(
    value &&
      typeof value ===
        'object' &&
      !Array.isArray(
        value,
      ),
  );
}

function str(
  value: unknown,
): string | null {
  return (
    typeof value ===
      'string' &&
    value.trim()
      ? value.trim()
      : null
  );
}

function finiteNumber(
  value: unknown,
): number | undefined {
  return (
    typeof value ===
      'number' &&
    Number.isFinite(
      value,
    )
      ? value
      : undefined
  );
}

function softwareEvidence(
  value: unknown,
):
  | SoftwareRunEventEvidence
  | undefined {
  if (
    !isRecord(
      value,
    )
  ) {
    return undefined;
  }

  const evidence:
    SoftwareRunEventEvidence = {
    filePath:
      str(
        value.filePath,
      ) ?? undefined,

    fileRevision:
      str(
        value.fileRevision,
      ) ?? undefined,

    diffId:
      str(
        value.diffId,
      ) ?? undefined,

    commandId:
      str(
        value.commandId,
      ) ?? undefined,

    checkId:
      str(
        value.checkId,
      ) ?? undefined,

    previewId:
      str(
        value.previewId,
      ) ?? undefined,

    commitSha:
      str(
        value.commitSha,
      ) ?? undefined,

    deploymentId:
      str(
        value.deploymentId,
      ) ?? undefined,

    exitCode:
      finiteNumber(
        value.exitCode,
      ),

    durationMs:
      finiteNumber(
        value.durationMs,
      ),

    projectId:
      str(
        value.projectId,
      ) ?? undefined,

    runtimeSessionId:
      str(
        value.runtimeSessionId,
      ) ?? undefined,

    processId:
      str(
        value.processId,
      ) ?? undefined,

    port:
      finiteNumber(
        value.port,
      ),

    previewKind:
      str(
        value.previewKind,
      ) ?? undefined,

    previewUrl:
      str(
        value.previewUrl,
      ) ?? undefined,
  };

  return evidence;
}

/**
 * Validate the Agent V2 event before allowing it into terminal state.
 */
function parseSoftwareEvent(
  payload:
    RawTerminalPayload,
):
  | SoftwareRunEvent
  | null {
  if (
    payload.softwareAgentV2 !==
    true
  ) {
    return null;
  }

  if (
    !isRecord(
      payload.softwareEvent,
    )
  ) {
    return null;
  }

  const raw =
    payload.softwareEvent;

  const id =
    str(
      raw.id,
    );

  const runId =
    str(
      raw.runId,
    );

  const createdAt =
    str(
      raw.createdAt,
    );

  const title =
    str(
      raw.title,
    );

  const eventType =
    str(
      raw.type,
    );

  const status =
    str(
      raw.status,
    );

  const sequence =
    finiteNumber(
      raw.sequence,
    );

  if (
    !id ||
    !runId ||
    !createdAt ||
    !title ||
    !eventType ||
    !SOFTWARE_EVENT_TYPES.has(
      eventType,
    ) ||
    !status ||
    !SOFTWARE_STATUSES.has(
      status,
    ) ||
    sequence ==
      null
  ) {
    return null;
  }

  return {
    id,

    runId,

    sequence,

    createdAt,

    type:
      eventType as
        SoftwareRunEventType,

    status:
      status as
        SoftwareRunStatus,

    title,

    summary:
      str(
        raw.summary,
      ) ?? undefined,

    evidence:
      softwareEvidence(
        raw.evidence,
      ),
  };
}

/**
 * Keepalives exist only to hold the connection open.
 */
function isKeepalive(
  payload:
    RawTerminalPayload,
): boolean {
  return (
    payload.keepalive ===
    true
  );
}

function levelFor(
  event: string,
  payload:
    RawTerminalPayload,
):
  TerminalEventLevel {
  if (
    event === 'error' ||
    payload.error
  ) {
    return 'error';
  }

  if (
    event ===
      'slow_request' ||
    event ===
      'billing_webhook_failed'
  ) {
    return 'warn';
  }

  if (
    event ===
    'complete'
  ) {
    return payload.success ===
      false
      ? 'error'
      : 'success';
  }

  return 'info';
}

function kindFor(
  event: string,
):
  | TerminalEventKind
  | null {
  switch (event) {
    case 'start':
    case 'pipeline':
      return 'session';

    case 'progress':
    case 'slow_request':
      return 'status';

    case 'delta':
      return 'output';

    case 'preview':
      return 'artifact';

    case 'complete':
      return 'result';

    case 'error':
    case 'billing_webhook_failed':
      return 'failure';

    /*
     * `done` only closes the HTTP stream.
     */
    case 'done':
      return null;

    default:
      return null;
  }
}

function textFor(
  event: string,
  payload:
    RawTerminalPayload,
): string | null {
  if (
    event === 'delta'
  ) {
    return str(
      payload.delta,
    );
  }

  if (
    event === 'error'
  ) {
    const base =
      str(
        payload.error,
      ) ??
      'Run failed';

    return (
      payload.code ===
        'CAPACITY_UNAVAILABLE'
        ? capacityUnavailableLine(
            base,
            payload.nextUnlockAt,
          )
        : base
    );
  }

  if (
    event === 'preview'
  ) {
    return 'Preview build ready';
  }

  if (
    event === 'complete'
  ) {
    return (
      payload.success ===
        false
        ? 'Run finished with errors'
        : 'Run complete'
    );
  }

  return (
    str(
      payload.swarmActivity,
    ) ??
    str(
      payload.message,
    ) ??
    str(
      payload.swarmStatusLabel,
    ) ??
    str(
      payload.status,
    )
  );
}

function durationLabel(
  durationMs:
    number | undefined,
): string | null {
  if (
    durationMs ==
    null
  ) {
    return null;
  }

  if (
    durationMs <
    1000
  ) {
    return `${Math.round(
      durationMs,
    )}ms`;
  }

  const seconds =
    durationMs /
    1000;

  return (
    seconds < 10
      ? `${seconds.toFixed(
          1,
        )}s`
      : `${Math.round(
          seconds,
        )}s`
  );
}

function softwareLevel(
  event:
    SoftwareRunEvent,
):
  TerminalEventLevel {
  if (
    event.status ===
    'failed'
  ) {
    return 'error';
  }

  if (
    event.status ===
    'cancelled'
  ) {
    return 'warn';
  }

  if (
    event.type ===
      'command.output' &&
    event.title
      .toLowerCase()
      .includes(
        'error output',
      )
  ) {
    return 'warn';
  }

  if (
    event.status ===
      'success' &&
    (
      event.type ===
        'command.completed' ||
      event.type ===
        'check.completed' ||
      event.type ===
        'preview.ready' ||
      event.type ===
        'browser.verification.completed' ||
      event.type ===
        'run.completed' ||
      event.type ===
        'deployment.ready'
    )
  ) {
    return 'success';
  }

  return 'info';
}

function softwareText(
  event:
    SoftwareRunEvent,
): {
  text: string;
  body: string | null;
} {
  switch (
    event.type
  ) {
    case 'command.started': {
      return {
        text:
          event.summary
            ? `Running ${event.summary}`
            : event.title,

        body:
          null,
      };
    }

    case 'command.output': {
      return {
        text:
          event.title,

        body:
          event.summary ??
          null,
      };
    }

    case 'command.completed': {
      const details:
        string[] = [];

      if (
        event.evidence
          ?.exitCode !=
        null
      ) {
        details.push(
          `exit ${event.evidence.exitCode}`,
        );
      }

      const duration =
        durationLabel(
          event.evidence
            ?.durationMs,
        );

      if (
        duration
      ) {
        details.push(
          duration,
        );
      }

      return {
        text:
          details.length
            ? `${event.title} · ${details.join(
                ' · ',
              )}`
            : event.title,

        /*
         * command.completed.summary contains the redacted command itself.
         */
        body:
          event.summary ??
          null,
      };
    }

    case 'file.read':
    case 'file.created':
    case 'file.updated':
    case 'file.deleted': {
      return {
        text:
          event.title,

        body:
          null,
      };
    }

    case 'check.started':
    case 'check.completed':
    case 'repair.started':
    case 'repair.completed':
    case 'preview.starting':
    case 'preview.ready':
    case 'preview.failed':
    case 'browser.verification.started':
    case 'browser.verification.completed':
    case 'project.inspect.started':
    case 'project.inspect.completed':
    case 'plan.updated':
    case 'git.branch.created':
    case 'git.commit.created':
    case 'deployment.started':
    case 'deployment.ready':
    case 'deployment.failed':
    case 'run.started':
    case 'run.completed':
    case 'run.failed':
    case 'run.cancelled':
    default:
      return {
        text:
          event.title,

        body:
          event.summary ??
          null,
      };
  }
}

/**
 * Permission gates the backend can signal.
 */
const PERMISSION_FLAGS:
  ReadonlyArray<
    readonly [
      string,
      string,
    ]
  > = [
    [
      'needsGitHub',
      'GitHub authorisation required',
    ],

    [
      'needsVercel',
      'Vercel authorisation required',
    ],

    [
      'needsRepoPick',
      'Repository selection required',
    ],
  ];

export function adaptTerminalEvent(
  event: string,
  payload:
    RawTerminalPayload,
  context:
    AdapterContext,
): TerminalEvent[] {
  const rows:
    TerminalEvent[] = [];

  const at =
    context.now ??
    Date.now();

  let seq =
    context.fromSeq;

  const push = (
    kind:
      TerminalEventKind,

    level:
      TerminalEventLevel,

    text:
      string,

    body:
      string | null,

    source?:
      string | null,
  ) => {
    rows.push({
      seq:
        ++seq,

      kind,

      level,

      source:
        source ===
          undefined
          ? str(
              payload.agent,
            )
          : source,

      /*
       * Redact at the frontend boundary as a second defense.
       *
       * Agent V2 already redacts public command output on the backend.
       */
      text:
        redactTerminalText(
          text,
        ),

      body:
        body
          ? redactTerminalText(
              body,
            )
          : null,

      at,

      rawEvent:
        event,
    });
  };

  /*
   * Permission gates must be processed before keepalive suppression.
   */
  for (
    const [
      flag,
      label,
    ] of
    PERMISSION_FLAGS
  ) {
    if (
      payload[
        flag
      ] ===
      true
    ) {
      push(
        'permission',
        'warn',
        label,
        null,
      );
    }
  }

  if (
    isKeepalive(
      payload,
    )
  ) {
    return rows;
  }

  /*
   * Software Agent V2 progress events receive richer terminal treatment than
   * generic swarm progress.
   *
   * They intentionally remain TerminalEventKind `status`.
   *
   * Agent V2's `run.completed` only means the implementation agent finished.
   * The outer Xroga pipeline may still need independent verification, commit,
   * and deployment. Marking it as TerminalEventKind `result` here would end
   * the whole frontend run too early.
   */
  if (
    event ===
    'progress'
  ) {
    const softwareEvent =
      parseSoftwareEvent(
        payload,
      );

    if (
      softwareEvent
    ) {
      const display =
        softwareText(
          softwareEvent,
        );

      push(
        'status',
        softwareLevel(
          softwareEvent,
        ),
        display.text,
        display.body,
        'builder',
      );

      return rows;
    }
  }

  const kind =
    kindFor(
      event,
    );

  if (
    !kind
  ) {
    return rows;
  }

  const text =
    textFor(
      event,
      payload,
    );

  if (
    !text
  ) {
    return rows;
  }

  const body =
    str(
      payload.detail,
    ) ??
    str(
      payload.stack,
    ) ??
    null;

  push(
    kind,
    levelFor(
      event,
      payload,
    ),
    text,
    body,
  );

  return rows;
}
