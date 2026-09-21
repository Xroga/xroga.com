import {
  randomUUID,
} from 'node:crypto';

import type {
  FileTrailEntry,
  ProjectFile,
} from '../../ai/patches.js';

import {
  workingFilesFromCheckpoint,
  type SoftwareAgentCheckpointStore,
} from '../../ai/softwareAgent/softwareAgentCheckpoint.js';

import type {
  SoftwareRunEvent,
} from '../../ai/softwareAgent/runEvents.js';

import type {
  BuildContract,
} from '../buildContract.js';

import type {
  ProjectRunState,
} from '../projectRunState.js';

import {
  SupabaseProjectRuntimeStore,
} from '../projectRuntime/index.js';

import {
  createSoftwareProject,
} from '../softwareProject.js';

import type {
  UniversalRunPlan,
} from '../universalFlow.js';

import {
  startOrRefreshLivePreview,
} from './coordinator.js';

import type {
  LivePreviewDescriptor,
} from './types.js';

export function isLivePreviewMutationEvent(
  event:
    SoftwareRunEvent,
): boolean {
  return (
    event.type ===
      'file.created' ||
    event.type ===
      'file.updated' ||
    event.type ===
      'file.deleted'
  );
}

function trailFor(
  event:
    SoftwareRunEvent,
): FileTrailEntry[] {
  const path =
    event.evidence
      ?.filePath;

  if (
    !path
  ) {
    return [];
  }

  const action:
    FileTrailEntry['action'] =
    event.type ===
      'file.created'
      ? 'created'
      : event.type ===
          'file.deleted'
        ? 'deleted'
        : 'modified';

  return [
    {
      path,

      before:
        '',

      after:
        '',

      added:
        0,

      removed:
        0,

      action,
    },
  ];
}

function liveLifecycle():
  ProjectRunState {
  return {
    schemaVersion:
      '1.0.0',

    planning: {
      status:
        'succeeded',

      detail:
        'Canonical planning is available.',
    },

    implementation: {
      status:
        'running',

      detail:
        'Agent V2 is actively modifying the project.',
    },

    runtime: {
      status:
        'running',

      detail:
        'Interactive Preview runtime is being synchronized.',
    },

    verification: {
      status:
        'not_started',

      detail:
        null,
    },

    persistence: {
      status:
        'succeeded',

      detail:
        'Current project workspace is durably checkpointed.',
    },

    publication: {
      status:
        'not_requested',

      detail:
        null,
    },

    deployment: {
      status:
        'not_requested',

      detail:
        null,
    },
  };
}

interface AgentLivePreviewBridgeInput {
  userId:
    string;

  runId:
    string;

  buildContract:
    BuildContract;

  plan:
    UniversalRunPlan;

  baseFiles:
    readonly ProjectFile[];

  checkpointStore:
    SoftwareAgentCheckpointStore;

  emit?:
    (
      event:
        SoftwareRunEvent,
    ) => void;
}

class AgentLivePreviewBridge {
  private started =
    false;

  private queue:
    Promise<void> =
    Promise.resolve();

  constructor(
    private readonly input:
      AgentLivePreviewBridgeInput,
  ) {}

  handle(
    event:
      SoftwareRunEvent,
  ): void {
    if (
      !isLivePreviewMutationEvent(
        event,
      )
    ) {
      return;
    }

    this.queue =
      this.queue
        .then(
          () =>
            this.sync(
              event,
            ),
        )
        .catch(
          (
            error,
          ) => {
            console.warn(
              '[agent_live_preview_sync_failed]',

              error instanceof
                Error
                ? error.message
                : String(
                    error,
                  ),
            );
          },
        );
  }

  private emitDescriptor(
    type:
      | 'preview.updated'
      | 'preview.failed',

    preview:
      LivePreviewDescriptor,

    source:
      SoftwareRunEvent,
  ): void {
    this.input.emit?.({
      id:
        randomUUID(),

      runId:
        this.input.runId,

      sequence:
        0,

      createdAt:
        new Date()
          .toISOString(),

      type,

      status:
        type ===
          'preview.updated'
          ? 'success'
          : 'failed',

      title:
        type ===
          'preview.updated'
          ? 'Live Preview updated'
          : 'Live Preview unavailable',

      summary:
        source.evidence
          ?.filePath
          ? `Preview synchronized after ${source.evidence.filePath}`
          : preview.message,

      evidence: {
        projectId:
          preview.projectId,

        runtimeSessionId:
          preview.sessionId ??
          undefined,

        processId:
          preview.processId ??
          undefined,

        port:
          preview.port ??
          undefined,

        previewKind:
          preview.kind,

        previewUrl:
          preview.url ??
          undefined,
      },
    });
  }

  private async sync(
    event:
      SoftwareRunEvent,
  ): Promise<void> {
    const checkpoint =
      await this.input
        .checkpointStore
        .load(
          this.input
            .runId,
        );

    if (
      !checkpoint
    ) {
      return;
    }

    const files =
      workingFilesFromCheckpoint(
        this.input
          .baseFiles,

        checkpoint,
      );

    if (
      files.length ===
      0
    ) {
      return;
    }

    const store =
      new SupabaseProjectRuntimeStore();

    const previous =
      await store
        .loadLatestRevision(
          this.input
            .userId,

          this.input
            .buildContract
            .projectId,
        );

    const baseProject =
      createSoftwareProject({
        contract:
          this.input
            .buildContract,

        architecture:
          this.input
            .plan
            .architecture,

        recipe:
          this.input
            .plan
            .productIntelligence
            .recipe ??
          null,

        filePlan:
          this.input
            .plan
            .productIntelligence
            .filePlan,

        files,

        fileTrail:
          trailFor(
            event,
          ),

        lifecycle:
          liveLifecycle(),

        runtime:
          previous
            ?.project
            .runtime ??
          null,

        verified:
          false,

        reason:
          'Implementation is still in progress.',

        blockers:
          [],

        repository:
          previous
            ?.project
            .repository ??
          null,
      });

    const project = {
      ...baseProject,

      workspace: {
        ...baseProject
          .workspace,

        revision:
          (
            previous
              ?.project
              .workspace
              .revision ??
            0
          ) +
          1,
      },
    };

    const first =
      !this.started;

    const result =
      await startOrRefreshLivePreview({
        userId:
          this.input
            .userId,

        project,

        runId:
          this.input
            .runId,

        emit:
          first
            ? this.input
                .emit
            : undefined,
      });

    await store
      .saveRevision(
        this.input
          .userId,

        result.project,
      );

    if (
      result.preview
        .status ===
      'ready'
    ) {
      if (
        !first
      ) {
        this.emitDescriptor(
          'preview.updated',

          result.preview,

          event,
        );
      }

      this.started =
        true;

      return;
    }

    if (
      !first &&
      result.preview
        .status ===
        'failed'
    ) {
      this.emitDescriptor(
        'preview.failed',

        result.preview,

        event,
      );
    }
  }
}

export function createAgentLivePreviewBridge(
  input:
    AgentLivePreviewBridgeInput,
): AgentLivePreviewBridge {
  return new AgentLivePreviewBridge(
    input,
  );
}
