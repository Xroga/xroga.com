import assert from 'node:assert/strict';

import {
  describe,
  it,
} from 'node:test';

import {
  goalContractSchema,
} from '../../ai/universal/goalContract.js';

import type {
  ProjectRuntimeCommandResult,
  ProjectRuntimeProvider,
  ProjectRuntimeProviderProbe,
  ProjectRuntimeSession,
  ProviderRuntimeCommand,
  ProviderRuntimeCreateInput,
  ProviderRuntimeProcessStartInput,
  RuntimePortExposure,
  RuntimeProcessStartResult,
  RuntimeSnapshot,
  ProjectRuntimeProcessRecord,
} from './types.js';

import {
  createBuildContract,
} from '../buildContract.js';

import {
  deriveProjectRunState,
} from '../projectRunState.js';

import {
  createSoftwareProject,
} from '../softwareProject.js';

import {
  InMemoryProjectRuntimeStore,
} from './store.js';

import {
  ProjectSecretManager,
} from './secretManager.js';

import {
  ProjectRuntimeManager,
} from './manager.js';

import {
  dependencyInstallPlan,
} from './dependencyManager.js';

import {
  inspectProjectRuntimeCapabilities,
} from './capabilities.js';

class FakePersistentProvider
  implements
    ProjectRuntimeProvider {
  readonly id =
    'fake-persistent';

  readonly capabilities = {
    persistentSessions:
      true,

    persistentProcesses:
      true,

    fileReadWrite:
      true,

    commandExec:
      true,

    snapshots:
      true,

    portDiscovery:
      true,

    publicPortExposure:
      false,

    secretInjection:
      true,

    networkIsolation:
      true,
  } as const;

  readonly files =
    new Map<
      string,
      string
    >();

  lastSecretEnvironment:
    Record<
      string,
      string
    > = {};

  async probe():
    Promise<ProjectRuntimeProviderProbe> {
    return {
      available:
        true,

      providerId:
        this.id,

      detail:
        'fake available',
    };
  }

  async create(
    input:
      ProviderRuntimeCreateInput,
  ): Promise<ProjectRuntimeSession> {
    for (
      const file of
      input.files
    ) {
      this.files.set(
        file.path,
        file.content,
      );
    }

    this.lastSecretEnvironment = {
      ...input.secretEnvironment,
    };

    const now =
      new Date()
        .toISOString();

    return {
      schemaVersion:
        '1.0.0',

      sessionId:
        'session-1',

      userId:
        input.userId,

      projectId:
        input.projectId,

      providerId:
        this.id,

      runtimeClass:
        input.runtimeClass,

      status:
        'running',

      image:
        input.image,

      workspaceRevision:
        1,

      knownFiles:
        input.files.map(
          (
            file,
          ) =>
            file.path,
        ),

      processes:
        [],

      ports:
        [],

      providerState: {
        machineId:
          'fake-machine',
      },

      createdAt:
        now,

      updatedAt:
        now,

      expiresAt:
        null,
    };
  }

  async restore(
    session:
      ProjectRuntimeSession,
  ): Promise<ProjectRuntimeSession> {
    return {
      ...session,

      status:
        'running',

      updatedAt:
        new Date()
          .toISOString(),
    };
  }

  async destroy():
    Promise<void> {}

  async writeFiles(
    _session:
      ProjectRuntimeSession,

    files:
      readonly {
        path:
          string;

        content:
          string;
      }[],
  ): Promise<void> {
    for (
      const file of
      files
    ) {
      this.files.set(
        file.path,
        file.content,
      );
    }
  }

  async readFile(
    _session:
      ProjectRuntimeSession,

    path:
      string,
  ): Promise<string | null> {
    return this.files.get(
      path,
    ) ??
    null;
  }

  async exec(
    _session:
      ProjectRuntimeSession,

    command:
      ProviderRuntimeCommand,
  ): Promise<ProjectRuntimeCommandResult> {
    this.lastSecretEnvironment = {
      ...command.secretEnvironment,
    };

    return {
      exitCode:
        0,

      stdout:
        `ran ${command.command}`,

      stderr:
        '',

      timedOut:
        false,

      durationMs:
        1,
    };
  }

  async startProcess(
    _session:
      ProjectRuntimeSession,

    input:
      ProviderRuntimeProcessStartInput,
  ): Promise<RuntimeProcessStartResult> {
    this.lastSecretEnvironment = {
      ...input.secretEnvironment,
    };

    return {
      pid:
        123,

      logPath:
        '/tmp/fake.log',
    };
  }

  async stopProcess(
    _session:
      ProjectRuntimeSession,

    _process:
      ProjectRuntimeProcessRecord,
  ): Promise<void> {}

  async processLogs():
    Promise<string> {
    return 'server ready';
  }

  async snapshot():
    Promise<RuntimeSnapshot> {
    return {
      files:
        [...this.files]
          .map(
            (
              [
                path,
                content,
              ],
            ) => ({
              path,
              content,
            }),
          ),

      createdAt:
        new Date()
          .toISOString(),
    };
  }

  async exposePort():
    Promise<RuntimePortExposure | null> {
    return null;
  }
}

function softwareProjectFixture() {
  const goal =
    goalContractSchema.parse({
      version:
        '1.0',

      goal:
        'Build a CLI',

      desiredOutcome:
        'A working CLI',

      semanticIntent:
        'MODIFY',

      constraints:
        [],

      acceptance: [
        'CLI works',
      ],

      previewRequirement:
        'NONE',

      confidence:
        1,
    });

  const contract =
    createBuildContract({
      projectId:
        'project-1',

      runId:
        'run-1',

      sourcePrompt:
        'Build a CLI',

      goal,

      existingFileCount:
        0,
    });

  const lifecycle =
    deriveProjectRunState({
      outcome:
        'completed',

      phaseReached:
        'complete',

      verified:
        true,

      fileCount:
        2,

      commitSha:
        null,

      reason:
        'complete',

      blockers:
        [],

      publicationRequested:
        false,

      deploymentRequested:
        false,
    });

  return createSoftwareProject({
    contract,

    files: [
      {
        path:
          'Cargo.toml',

        content:
          '[package]\nname="demo"',
      },

      {
        path:
          'src/main.rs',

        content:
          'fn main() {}',
      },
    ],

    fileTrail:
      [],

    lifecycle,

    verified:
      true,

    reason:
      'complete',

    blockers:
      [],
  });
}

describe(
  'Step 3 project runtime platform',
  () => {
    it(
      'persists full canonical project revisions',
      async () => {
        const store =
          new InMemoryProjectRuntimeStore();

        const project =
          softwareProjectFixture();

        const saved =
          await store.saveRevision(
            'user-1',
            project,
          );

        const loaded =
          await store
            .loadLatestRevision(
              'user-1',
              project.projectId,
            );

        assert.ok(
          loaded,
        );

        assert.equal(
          loaded.revisionId,
          saved.revisionId,
        );

        assert.equal(
          loaded.project
            .workspace
            .files
            .length,
          2,
        );

        assert.equal(
          loaded
            .workspaceFingerprint,
          saved
            .workspaceFingerprint,
        );
      },
    );

    it(
      'encrypts project secrets and never stores plaintext',
      async () => {
        const store =
          new InMemoryProjectRuntimeStore();

        const manager =
          new ProjectSecretManager(
            'user-1',

            store,

            {
              USER_SECRETS_ENCRYPTION_KEY:
                'test-secret-encryption-key-that-is-long-enough',
            },
          );

        await manager.put({
          projectId:
            'project-1',

          name:
            'OPENAI_API_KEY',

          value:
            'sk-test-super-secret-value',

          scope:
            'preview',
        });

        const records =
          await store
            .loadEncryptedSecrets(
              'user-1',
              'project-1',
            );

        assert.equal(
          records.length,
          1,
        );

        assert.equal(
          records[0]
            ?.encryptedValue
            .includes(
              'sk-test-super-secret-value',
            ),
          false,
        );

        const env =
          await manager
            .resolveEnvironment(
              'project-1',
              [
                'preview',
              ],
            );

        assert.equal(
          env.OPENAI_API_KEY,
          'sk-test-super-secret-value',
        );
      },
    );

    it(
      'creates and restores a persistent interactive runtime',
      async () => {
        const store =
          new InMemoryProjectRuntimeStore();

        const provider =
          new FakePersistentProvider();

        const runtime =
          new ProjectRuntimeManager(
            'user-1',
            store,
            [
              provider,
            ],
          );

        const session =
          await runtime.create({
            projectId:
              'project-1',

            runtimeClass:
              'interactive',

            files: [
              {
                path:
                  'index.html',

                content:
                  '<h1>Hello</h1>',
              },
            ],
          });

        assert.equal(
          session.status,
          'running',
        );

        assert.equal(
          session.providerId,
          'fake-persistent',
        );

        const restored =
          await runtime.restore(
            session.sessionId,
          );

        assert.equal(
          restored.status,
          'running',
        );
      },
    );

    it(
      'tracks file revisions independently from the runtime provider',
      async () => {
        const store =
          new InMemoryProjectRuntimeStore();

        const provider =
          new FakePersistentProvider();

        const runtime =
          new ProjectRuntimeManager(
            'user-1',
            store,
            [
              provider,
            ],
          );

        const session =
          await runtime.create({
            projectId:
              'project-1',

            runtimeClass:
              'interactive',

            files: [
              {
                path:
                  'a.txt',

                content:
                  'one',
              },
            ],
          });

        const updated =
          await runtime.writeFiles(
            session.sessionId,
            [
              {
                path:
                  'a.txt',

                content:
                  'two',
              },

              {
                path:
                  'b.txt',

                content:
                  'three',
              },
            ],
          );

        assert.equal(
          updated.workspaceRevision,
          2,
        );

        assert.deepEqual(
          updated.knownFiles,
          [
            'a.txt',
            'b.txt',
          ],
        );
      },
    );

    it(
      'tracks long-running processes and declared ports',
      async () => {
        const store =
          new InMemoryProjectRuntimeStore();

        const provider =
          new FakePersistentProvider();

        const runtime =
          new ProjectRuntimeManager(
            'user-1',
            store,
            [
              provider,
            ],
          );

        const session =
          await runtime.create({
            projectId:
              'project-1',

            runtimeClass:
              'interactive',

            files:
              [],
          });

        const process =
          await runtime
            .startProcess(
              session.sessionId,
              {
                command:
                  'npm',

                args: [
                  'run',
                  'dev',
                ],

                port:
                  3000,
              },
            );

        assert.equal(
          process.pid,
          123,
        );

        const ports =
          await runtime
            .listPorts(
              session.sessionId,
            );

        assert.equal(
          ports[0]
            ?.port,
          3000,
        );
      },
    );

    it(
      'derives dependency installation from runtime adapters instead of hard-coded pipeline commands',
      () => {
        const steps =
          dependencyInstallPlan([
            {
              path:
                'package.json',

              content:
                JSON.stringify({
                  scripts: {
                    build:
                      'tsc',
                  },
                }),
            },

            {
              path:
                'package-lock.json',

              content:
                '{}',
            },
          ]);

        assert.ok(
          steps.some(
            (
              step,
            ) =>
              step.command ===
              'npm',
          ),
        );
      },
    );

    it(
      'reports runtime capability truth instead of assuming Preview support',
      async () => {
        const provider =
          new FakePersistentProvider();

        const truth =
          await inspectProjectRuntimeCapabilities([
            provider,
          ]);

        assert.equal(
          truth
            .interactiveRuntimeAvailable,
          true,
        );

        assert.equal(
          truth
            .publicPreviewExposureAvailable,
          false,
        );
      },
    );
  },
);
