import {
  randomUUID,
} from 'node:crypto';

import type {
  SoftwareRunEvent,
  SoftwareRunEventEvidence,
  SoftwareRunStatus,
  SoftwareRunEventType,
} from '../../ai/softwareAgent/runEvents.js';

import type {
  SoftwareProject,
} from '../softwareProject.js';

import {
  createProjectRuntimeManager,
  ProjectDependencyManager,
  ProjectProcessManager,
  SupabaseProjectRuntimeStore,
} from '../projectRuntime/index.js';

import type {
  ProjectRuntimeSession,
} from '../projectRuntime/types.js';

import {
  createLivePreviewGrant,
  getLatestLivePreviewGrant,
  revokeLivePreviewGrants,
} from './store.js';

import {
  livePreviewUrl,
} from './signing.js';

import {
  planLivePreview,
} from './plan.js';

import {
  LIVE_PREVIEW_SCHEMA_VERSION,
  type LivePreviewDescriptor,
  type LivePreviewLaunchPlan,
} from './types.js';

export type LivePreviewEventEmitter =
  (
    event:
      SoftwareRunEvent,
  ) =>
    | void
    | Promise<void>;

function now():
  string {
  return new Date()
    .toISOString();
}

function event(
  input: {
    runId:
      string;

    type:
      SoftwareRunEventType;

    status:
      SoftwareRunStatus;

    title:
      string;

    summary?:
      string;

    evidence?:
      SoftwareRunEventEvidence;
  },
): SoftwareRunEvent {
  return {
    id:
      randomUUID(),

    runId:
      input.runId,

    /*
     * The outer swarm transport assigns the durable canonical sequence.
     * This nested event only needs a finite public value.
     */
    sequence:
      0,

    createdAt:
      now(),

    type:
      input.type,

    status:
      input.status,

    title:
      input.title,

    summary:
      input.summary,

    evidence:
      input.evidence,
  };
}

async function emit(
  emitter:
    LivePreviewEventEmitter | undefined,

  value:
    SoftwareRunEvent,
): Promise<void> {
  await emitter?.(
    value,
  );
}

function dependencyFilesChanged(
  project:
    SoftwareProject,
): boolean {
  const changed =
    new Set([
      ...project
        .changeSet
        .created,

      ...project
        .changeSet
        .modified,

      ...project
        .changeSet
        .deleted,
    ]);

  return [...changed].some(
    (
      path,
    ) =>
      /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|pyproject\.toml|requirements[^/]*\.txt|poetry\.lock|uv\.lock|Pipfile(?:\.lock)?|Cargo\.toml|Cargo\.lock)$/.test(
        path,
      ),
  );
}

function previewExpiry(
  session:
    ProjectRuntimeSession,
): string {
  const defaultExpiry =
    Date.now() +
    45 *
      60 *
      1000;

  if (
    !session.expiresAt
  ) {
    return new Date(
      defaultExpiry,
    ).toISOString();
  }

  const sessionExpiry =
    Date.parse(
      session.expiresAt,
    );

  return new Date(
    Math.min(
      defaultExpiry,
      Number.isFinite(
        sessionExpiry,
      )
        ? sessionExpiry
        : defaultExpiry,
    ),
  ).toISOString();
}

async function waitForProcess(
  input: {
    runtime:
      ReturnType<
        typeof createProjectRuntimeManager
      >;

    sessionId:
      string;

    plan:
      LivePreviewLaunchPlan;
  },
): Promise<boolean> {
  const probe =
    input.plan
      .process;

 if (
  !probe ||
  !probe.probeCommand
) {
  return true;
}

  for (
    let attempt =
      0;

    attempt <
    24;

    attempt +=
      1
  ) {
    const result =
      await input.runtime
        .exec(
          input.sessionId,
          {
            command:
              probe
                .probeCommand,

            args:
              probe
                .probeArgs,

            networkPolicy:
              'preview',

            timeoutMs:
              5_000,
          },
        );

    if (
      result.exitCode ===
      0
    ) {
      return true;
    }

    await new Promise<void>(
      (
        resolve,
      ) => {
        setTimeout(
          resolve,
          500,
        );
      },
    );
  }

  return false;
}

async function emitPlanningEvents(
  input: {
    project:
      SoftwareProject;

    runId:
      string;

    emitter?:
      LivePreviewEventEmitter;
  },
): Promise<void> {
  await emit(
    input.emitter,

    event({
      runId:
        input.runId,

      type:
        'goal.resolved',

      status:
        'success',

      title:
        'Goal resolved',

      summary:
        input.project
          .contract
          .semanticGoal
          .goal,
    }),
  );

  if (
    input.project.recipe
  ) {
    await emit(
      input.emitter,

      event({
        runId:
          input.runId,

        type:
          'recipe.selected',

        status:
          'success',

        title:
          'Build recipe selected',

        summary:
          `${input.project.recipe.id} · ${input.project.recipe.label}`,
      }),
    );
  }

  if (
    input.project
      .architecture
  ) {
    await emit(
      input.emitter,

      event({
        runId:
          input.runId,

        type:
          'architecture.selected',

        status:
          'success',

        title:
          'Architecture selected',

        summary:
          input.project
            .architecture
            .components
            .map(
              (
                component,
              ) =>
                [
                  component.language,
                  component.framework,
                  component.runtime,
                ]
                  .filter(
                    Boolean,
                  )
                  .join(
                    '/',
                  ),
            )
            .filter(
              Boolean,
            )
            .join(
              ', ',
            ),
      }),
    );
  }

  if (
    input.project.filePlan
  ) {
    await emit(
      input.emitter,

      event({
        runId:
          input.runId,

        type:
          'file_plan.created',

        status:
          'success',

        title:
          'File plan ready',

        summary:
          `${input.project.filePlan.entries.length} planned file role(s)`,
      }),
    );
  }
}

export async function startOrRefreshLivePreview(
  input: {
    userId:
      string;

    project:
      SoftwareProject;

    runId:
      string;

    emit?:
      LivePreviewEventEmitter;

    forceRestart?:
      boolean;
  },
): Promise<{
  project:
    SoftwareProject;

  preview:
    LivePreviewDescriptor;
}> {
  const launchPlan =
    planLivePreview(
      input.project,
    );

  await emitPlanningEvents({
    project:
      input.project,

    runId:
      input.runId,

    emitter:
      input.emit,
  });

  if (
    launchPlan.kind ===
    'none'
  ) {

    if (
  !launchPlan.process &&
  !launchPlan.command
) {
  return {
    project:
      input.project,

    preview: {
      schemaVersion:
        LIVE_PREVIEW_SCHEMA_VERSION,

      projectId:
        input.project.projectId,

      runId:
        input.runId,

      kind:
        launchPlan.kind,

      status:
        'not_applicable',

      sessionId:
        null,

      processId:
        null,

      providerId:
        null,

      port:
        null,

      url:
        null,

      expiresAt:
        null,

      message:
        launchPlan.message,

      updatedAt:
        now(),
    },
  };
}
    
    return {
      project:
        input.project,

      preview: {
        schemaVersion:
          LIVE_PREVIEW_SCHEMA_VERSION,

        projectId:
          input.project.projectId,

        runId:
          input.runId,

        kind:
          'none',

        status:
          'not_applicable',

        sessionId:
          null,

        processId:
          null,

        providerId:
          null,

        port:
          null,

        url:
          null,

        expiresAt:
          null,

        message:
          launchPlan.message,

        updatedAt:
          now(),
      },
    };
  }

  await emit(
    input.emit,

    event({
      runId:
        input.runId,

      type:
        'preview.starting',

      status:
        'running',

      title:
        'Starting live Preview',

      summary:
        launchPlan.message,

      evidence: {
        projectId:
          input.project.projectId,

        previewKind:
          launchPlan.kind,
      },
    }),
  );

  const runtime =
    createProjectRuntimeManager(
      input.userId,
    );

  const runtimeStore =
    new SupabaseProjectRuntimeStore();

  let session:
    ProjectRuntimeSession | null =
    null;

  let freshRuntime =
    false;

  try {
    const previous =
      await runtimeStore
        .loadLatestRevision(
          input.userId,
          input.project
            .projectId,
        );

    const previousBinding =
      previous
        ?.project
        .runtime;

    if (
      previousBinding &&
      previousBinding
        .runtimeClass ===
        'interactive' &&
      previousBinding
        .status ===
        'running'
    ) {
      try {
        session =
          await runtime
            .restore(
              previousBinding
                .sessionId,
            );

        if (
          launchPlan.image &&
          session.image &&
          launchPlan.image !==
            session.image
        ) {
          await runtime.destroy(
            session.sessionId,
          );

          session =
            null;
        }
      } catch {
        session =
          null;
      }
    }

    if (
      !session
    ) {
      freshRuntime =
        true;

      session =
        await runtime
          .create({
            projectId:
              input.project
                .projectId,

            runtimeClass:
              'interactive',

            files:
              input.project
                .workspace
                .files,

            image:
              launchPlan.image,

            environment: {
              XROGA_PREVIEW:
                '1',
            },

            ttlSeconds:
              45 *
              60,
          });

      await emit(
        input.emit,

        event({
          runId:
            input.runId,

          type:
            'runtime.started',

          status:
            'success',

          title:
            'Project runtime ready',

          summary:
            `${session.providerId} · ${session.sessionId}`,

          evidence: {
            projectId:
              input.project
                .projectId,

            runtimeSessionId:
              session.sessionId,
          },
        }),
      );
    } else {
      session =
        await runtime
          .writeFiles(
            session.sessionId,

            input.project
              .workspace
              .files,
          );

      await emit(
        input.emit,

        event({
          runId:
            input.runId,

          type:
            'workspace.created',

          status:
            'success',

          title:
            'Runtime workspace updated',

          summary:
            `${input.project.workspace.fileCount} current project file(s)`,

          evidence: {
            projectId:
              input.project
                .projectId,

            runtimeSessionId:
              session.sessionId,
          },
        }),
      );
    }

    if (
      launchPlan
        .installDependencies &&
      (
        freshRuntime ||
        dependencyFilesChanged(
          input.project,
        )
      )
    ) {
      await emit(
        input.emit,

        event({
          runId:
            input.runId,

          type:
            'dependency.install.started',

          status:
            'running',

          title:
            'Installing project dependencies',

          evidence: {
            runtimeSessionId:
              session.sessionId,
          },
        }),
      );

      const dependencies =
        await new ProjectDependencyManager(
          runtime,
        ).install({
          sessionId:
            session.sessionId,

          sessionImage:
            session.image,

          files:
            input.project
              .workspace
              .files,
        });

      await emit(
        input.emit,

        event({
          runId:
            input.runId,

          type:
            'dependency.install.completed',

          status:
            dependencies.installed
              ? 'success'
              : 'failed',

          title:
            dependencies.installed
              ? 'Dependencies installed'
              : 'Dependency installation incomplete',

          summary:
            dependencies.installed
              ? `${dependencies.steps.length} install step(s)`
              : [
                  ...dependencies.failures,
                  ...dependencies.blockers,
                ]
                  .slice(
                    0,
                    3,
                  )
                  .join(
                    ' · ',
                  ),

          evidence: {
            runtimeSessionId:
              session.sessionId,
          },
        }),
      );

      if (
        !dependencies
          .installed
      ) {
        throw new Error(
          [
            ...dependencies
              .failures,

            ...dependencies
              .blockers,
          ]
            .filter(
              Boolean,
            )
            .join(
              ' ',
            ) ||
          'Dependency installation failed.',
        );
      }
    }

    let processId:
  string | null =
  null;

let representationMessage =
  launchPlan.message;

if (
  launchPlan.command
) {
  const commandId =
    randomUUID();

  await emit(
    input.emit,

    event({
      runId:
        input.runId,

      type:
        'command.started',

      status:
        'running',

      title:
        'Running CLI Preview',

      summary: [
        launchPlan
          .command
          .command,

        ...launchPlan
          .command
          .args,
      ].join(
        ' ',
      ),

      evidence: {
        commandId,

        projectId:
          input.project
            .projectId,

        runtimeSessionId:
          session.sessionId,
      },
    }),
  );

  const commandResult =
    await runtime.exec(
      session.sessionId,

      {
        command:
          launchPlan
            .command
            .command,

        args:
          launchPlan
            .command
            .args,

        cwd:
          launchPlan
            .command
            .cwd,

        environment:
          launchPlan
            .command
            .environment,

        secretScopes:
          [],

        networkPolicy:
          'none',

        timeoutMs:
          launchPlan
            .command
            .timeoutMs,
      },
    );

  const output =
    [
      commandResult
        .stdout,

      commandResult
        .stderr,
    ]
      .filter(
        Boolean,
      )
      .join(
        '\n',
      )
      .trim();

  await emit(
    input.emit,

    event({
      runId:
        input.runId,

      type:
        'command.completed',

      status:
        commandResult
          .exitCode ===
          0
          ? 'success'
          : 'failed',

      title:
        commandResult
          .exitCode ===
          0
          ? 'CLI Preview completed'
          : 'CLI Preview failed',

      summary:
        output
          .slice(
            -1_200,
          ) ||
        `Exit code ${commandResult.exitCode ?? 'unknown'}`,

      evidence: {
        commandId,

        projectId:
          input.project
            .projectId,

        runtimeSessionId:
          session.sessionId,

        exitCode:
          commandResult
            .exitCode ??
          undefined,

        durationMs:
          commandResult
            .durationMs,
      },
    }),
  );

  if (
    commandResult
      .exitCode !==
    0
  ) {
    throw new Error(
      output ||
      `CLI Preview exited with code ${commandResult.exitCode ?? 'unknown'}.`,
    );
  }

  representationMessage =
    output
      ? output.slice(
          -4_000,
        )
      : launchPlan
          .message;
}

    if (
      launchPlan.process
    ) {
      const processManager =
        new ProjectProcessManager(
          runtime,
        );

      const current =
        (
          await runtimeStore
            .loadSession(
              input.userId,
              session.sessionId,
            )
        ) ??
        session;

      let previewProcess =
        current.processes
          .find(
            (
              process,
            ) =>
              process.status ===
                'running' &&
              process.port ===
                launchPlan
                  .process!
                  .port,
          ) ??
        null;

      if (
        previewProcess &&
        (
          input.forceRestart ||
          !launchPlan
            .process
            .hotReload
        )
      ) {
        await processManager
          .stop(
            session.sessionId,
            previewProcess
              .processId,
          );

        previewProcess =
          null;
      }

      if (
        !previewProcess
      ) {
        previewProcess =
          await processManager
            .start(
              session.sessionId,

              {
                command:
                  launchPlan
                    .process
                    .command,

                args:
                  launchPlan
                    .process
                    .args,

                cwd:
                  launchPlan
                    .process
                    .cwd,

                environment:
                  launchPlan
                    .process
                    .environment,

                /*
                 * Preview code runs only inside the isolated runtime.
                 *
                 * It receives no secret scope here.
                 */
                secretScopes:
                  [],

                networkPolicy:
                  'preview',

                port:
                  launchPlan
                    .process
                    .port,

                restartPolicy:
                  'on_failure',
              },
            );

        await emit(
          input.emit,

          event({
            runId:
              input.runId,

            type:
              'process.started',

            status:
              'success',

            title:
              'Preview process started',

            summary:
              [
                previewProcess
                  .command,

                ...previewProcess
                  .args,
              ].join(
                ' ',
              ),

            evidence: {
              runtimeSessionId:
                session
                  .sessionId,

              processId:
                previewProcess
                  .processId,

              port:
                previewProcess
                  .port ??
                undefined,
            },
          }),
        );
      }

      processId =
        previewProcess
          .processId;

      const ready =
        await waitForProcess({
          runtime,

          sessionId:
            session
              .sessionId,

          plan:
            launchPlan,
        });

      if (
        !ready
      ) {
        const logs =
          await processManager
            .logs(
              session.sessionId,
              previewProcess
                .processId,
            )
            .catch(
              () =>
                '',
            );

        throw new Error(
          `Preview process did not become ready.${logs ? ` ${logs.slice(-1_500)}` : ''}`,
        );
      }
    }

    const binding =
      await runtime
        .binding(
          session.sessionId,
        );

    const updatedProject:
      SoftwareProject = {
      ...input.project,

      runtime:
        binding,

      updatedAt:
        now(),
    };

    let previewUrl:
      string | null =
      null;

    let expiresAt:
  string | null =
  null;

const previewPort =
  launchPlan.process
    ?.port ??
  null;

if (
  previewPort !==
  null
) {
      let grant =
        await getLatestLivePreviewGrant({
          userId:
            input.userId,

          projectId:
            input.project
              .projectId,

          sessionId:
            session.sessionId,
        });

      if (
        !grant
      ) {
        await revokeLivePreviewGrants({
          userId:
            input.userId,

          projectId:
            input.project
              .projectId,
        });

        grant =
          await createLivePreviewGrant({
            userId:
              input.userId,

            projectId:
              input.project
                .projectId,

            sessionId:
              session.sessionId,

            runId:
              input.runId,

            kind:
              launchPlan.kind as
                Exclude<
                  typeof launchPlan.kind,
                  'none'
                >,

            port:
  previewPort,

            expiresAt:
              previewExpiry(
                session,
              ),
          });
      }

      previewUrl =
        livePreviewUrl(
          grant,
        );

      expiresAt =
        grant.expiresAt;
    }

    const descriptor:
      LivePreviewDescriptor = {
      schemaVersion:
        LIVE_PREVIEW_SCHEMA_VERSION,

      projectId:
        input.project
          .projectId,

      runId:
        input.runId,

      kind:
        launchPlan.kind,

      status:
        'ready',

      sessionId:
        session.sessionId,

      processId,

      providerId:
        session.providerId,

      port:
        launchPlan.process
          ?.port ??
        null,

      url:
        previewUrl,

      expiresAt,

      message:
  representationMessage,

      updatedAt:
        now(),
    };

    await emit(
      input.emit,

      event({
        runId:
          input.runId,

        type:
          'preview.ready',

        status:
          'success',

        title:
          previewUrl
            ? 'Live Preview ready'
            : 'Product Preview ready',

        summary:
  representationMessage
    .slice(
      0,
      1_200,
    ),

        evidence: {
          projectId:
            descriptor
              .projectId,

          runtimeSessionId:
            descriptor
              .sessionId ??
            undefined,

          processId:
            descriptor
              .processId ??
            undefined,

          port:
            descriptor.port ??
            undefined,

          previewKind:
            descriptor.kind,

          previewUrl:
            descriptor.url ??
            undefined,
        },
      }),
    );

    return {
      project:
        updatedProject,

      preview:
        descriptor,
    };
  } catch (
    error
  ) {
    let project =
      input.project;

    if (
      session
    ) {
      try {
        project = {
          ...project,

          runtime:
            await runtime
              .binding(
                session.sessionId,
              ),

          updatedAt:
            now(),
        };
      } catch {
        // Preserve canonical project even if runtime state could not be read.
      }
    }

    const message =
      error instanceof
        Error
        ? error.message
        : String(
            error,
          );

    const descriptor:
      LivePreviewDescriptor = {
      schemaVersion:
        LIVE_PREVIEW_SCHEMA_VERSION,

      projectId:
        input.project
          .projectId,

      runId:
        input.runId,

      kind:
        launchPlan.kind,

      status:
        'failed',

      sessionId:
        session
          ?.sessionId ??
        null,

      processId:
        null,

      providerId:
        session
          ?.providerId ??
        null,

      port:
        launchPlan.process
          ?.port ??
        null,

      url:
        null,

      expiresAt:
        null,

      message,

      updatedAt:
        now(),
    };

    await emit(
      input.emit,

      event({
        runId:
          input.runId,

        type:
          'preview.failed',

        status:
          'failed',

        title:
          'Live Preview unavailable',

        summary:
          message,

        evidence: {
          projectId:
            input.project
              .projectId,

          runtimeSessionId:
            session
              ?.sessionId,

          previewKind:
            launchPlan.kind,
        },
      }),
    );

    /*
     * Preview failure is not implementation failure.
     */
    return {
      project,

      preview:
        descriptor,
    };
  }
}
