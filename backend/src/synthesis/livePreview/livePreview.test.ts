import assert from 'node:assert/strict';

import {
  describe,
  it,
} from 'node:test';

import type {
  SoftwareProject,
} from '../softwareProject.js';

import {
  planLivePreview,
} from './plan.js';

import {
  livePreviewUrl,
  parseLivePreviewHost,
  verifyLivePreviewSignature,
} from './signing.js';

import type {
  LivePreviewGrant,
} from './types.js';

function project(
  files:
    Array<{
      path:
        string;

      content:
        string;
    }>,

  previewStrategy:
    string,
): SoftwareProject {
  return {
    workspace: {
      files,
    },

    recipe: {
      previewStrategy,
    },
  } as unknown as
    SoftwareProject;
}

describe(
  'Step 4 live Preview',
  () => {
    it(
      'plans a dependency-free static browser Preview',
      () => {
        const plan =
          planLivePreview(
            project(
              [
                {
                  path:
                    'index.html',

                  content:
                    '<h1>Hello</h1>',
                },
              ],

              'browser',
            ),
          );

        assert.equal(
          plan.kind,
          'browser',
        );

        assert.equal(
          plan.process
            ?.command,
          'node',
        );

        assert.equal(
          plan.process
            ?.port,
          3000,
        );
      },
    );

    it(
      'plans Vite with an IPv6 Preview host and fixed Preview port',
      () => {
        const plan =
          planLivePreview(
            project(
              [
                {
                  path:
                    'package.json',

                  content:
                    JSON.stringify({
                      scripts: {
                        dev:
                          'vite',
                      },

                      devDependencies: {
                        vite:
                          '^7.0.0',
                      },
                    }),
                },

                {
                  path:
                    'src/App.tsx',

                  content:
                    'export default function App(){return null}',
                },
              ],

              'browser',
            ),
          );

        assert.equal(
          plan.kind,
          'browser',
        );

        assert.equal(
          plan.process
            ?.command,
          'npm',
        );

        assert.deepEqual(
          plan.process
            ?.args,
          [
            'run',
            'dev',
            '--',
            '--host',
            '::',
            '--port',
            '3000',
          ],
        );
      },
    );

    it(
      'plans Next.js on the canonical Preview port',
      () => {
        const plan =
          planLivePreview(
            project(
              [
                {
                  path:
                    'package.json',

                  content:
                    JSON.stringify({
                      scripts: {
                        dev:
                          'next dev',
                      },

                      dependencies: {
                        next:
                          '^16.0.0',
                      },
                    }),
                },

                {
                  path:
                    'app/page.tsx',

                  content:
                    'export default function Page(){return null}',
                },
              ],

              'browser',
            ),
          );

        assert.deepEqual(
          plan.process
            ?.args,
          [
            'run',
            'dev',
            '--',
            '-H',
            '::',
            '-p',
            '3000',
          ],
        );
      },
    );

    it(
      'plans a FastAPI runtime Preview',
      () => {
        const plan =
          planLivePreview(
            project(
              [
                {
                  path:
                    'pyproject.toml',

                  content:
                    '[project]\nname="api"\n',
                },

                {
                  path:
                    'app/main.py',

                  content:
                    [
                      'from fastapi import FastAPI',
                      'app = FastAPI()',
                    ].join(
                      '\n',
                    ),
                },
              ],

              'api_console',
            ),
          );

        assert.equal(
          plan.kind,
          'api',
        );

        assert.deepEqual(
          plan.process
            ?.args,
          [
            '-m',
            'uvicorn',
            'app.main:app',
            '--host',
            '::',
            '--port',
            '3000',
          ],
        );
      },
    );

    it(
      'keeps a CLI as a terminal Preview rather than inventing a browser',
      () => {
        const plan =
          planLivePreview(
            project(
              [
                {
                  path:
                    'Cargo.toml',

                  content:
                    '[package]\nname="tool"\nversion="0.1.0"\n',
                },

                {
                  path:
                    'src/main.rs',

                  content:
                    'fn main() {}',
                },
              ],

              'terminal',
            ),
          );

        assert.equal(
          plan.kind,
          'terminal',
        );

        assert.equal(
  plan.process,
  null,
);
        
assert.equal(
  plan.command
    ?.command,
  'cargo',
);

assert.deepEqual(
  plan.command
    ?.args,
  [
    'run',
    '--',
    '--help',
  ],
);
        it(
  'plans a worker as a real log-backed runtime process',
  () => {
    const plan =
      planLivePreview(
        project(
          [
            {
              path:
                'package.json',

              content:
                JSON.stringify({
                  scripts: {
                    worker:
                      'node worker.js',
                  },
                }),
            },

            {
              path:
                'worker.js',

              content:
                'console.log("worker ready")',
            },
          ],

          'logs',
        ),
      );

    assert.equal(
      plan.kind,
      'logs',
    );

    assert.equal(
      plan.process
        ?.command,
      'npm',
    );

    assert.deepEqual(
      plan.process
        ?.args,
      [
        'run',
        'worker',
      ],
    );

    assert.equal(
      plan.process
        ?.port,
      null,
    );
  },
);

it(
  'does not claim a runnable mobile Preview without a mobile runtime provider',
  () => {
    const plan =
      planLivePreview(
        project(
          [
            {
              path:
                'package.json',

              content:
                JSON.stringify({
                  scripts: {
                    start:
                      'expo start',
                  },
                }),
            },
          ],

          'mobile_runtime',
        ),
      );

    assert.equal(
      plan.kind,
      'mobile',
    );

    assert.equal(
      plan.process,
      null,
    );

    assert.equal(
      plan.command,
      null,
    );

    assert.match(
      plan.message,
      /not connected/i,
    );
  },
);
      },
    );

    it(
      'creates and validates a signed temporary Preview hostname',
      () => {
        const env = {
          NODE_ENV:
            'test',

          XROGA_PREVIEW_BASE_DOMAIN:
            'preview.example.com',

          XROGA_PREVIEW_SIGNING_SECRET:
            '12345678901234567890123456789012',
        };

        const grant:
          LivePreviewGrant = {
          previewId:
            '11111111-2222-4333-8444-555555555555',

          userId:
            'user',

          projectId:
            'project',

          sessionId:
            'session',

          runId:
            'run',

          kind:
            'browser',

          port:
            3000,

          expiresAt:
            '2026-09-20T12:00:00.000Z',

          revokedAt:
            null,

          createdAt:
            '2026-09-19T12:00:00.000Z',
        };

        const url =
          livePreviewUrl(
            grant,
            env,
          );

        const hostname =
          new URL(
            url,
          ).hostname;

        const parsed =
          parseLivePreviewHost(
            hostname,
            env,
          );

        assert.ok(
          parsed,
        );

        assert.equal(
          parsed.previewId,
          grant.previewId,
        );

        assert.equal(
          verifyLivePreviewSignature(
            grant,
            parsed.signature,
            env,
          ),
          true,
        );
      },
    );
  },
);
