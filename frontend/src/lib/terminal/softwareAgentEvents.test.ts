import assert from 'node:assert/strict';

import {
  test,
} from 'node:test';

import {
  adaptTerminalEvent,
} from './terminalEventAdapter';

function softwareEvent(
  overrides:
    Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id:
      'event-1',

    runId:
      'run-1',

    sequence:
      1,

    createdAt:
      '2026-09-16T12:00:00.000Z',

    type:
      'file.updated',

    status:
      'success',

    title:
      'Updated src/App.tsx',

    evidence: {
      filePath:
        'src/App.tsx',

      fileRevision:
        'rev-2',
    },

    ...overrides,
  };
}

function adapt(
  event:
    Record<string, unknown>,
) {
  return adaptTerminalEvent(
    'progress',

    {
      agent:
        'builder',

      builderVersion:
        'agent-v2',

      softwareAgentV2:
        true,

      softwareEvent:
        event,
    },

    {
      fromSeq:
        0,

      now:
        1000,
    },
  );
}

test(
  'Agent V2 file update becomes visible terminal activity',
  () => {
    const [
      row,
    ] =
      adapt(
        softwareEvent(),
      );

    assert.equal(
      row.kind,
      'status',
    );

    assert.equal(
      row.source,
      'builder',
    );

    assert.equal(
      row.text,
      'Updated src/App.tsx',
    );

    assert.equal(
      row.body,
      null,
    );
  },
);

test(
  'Agent V2 command start displays the real redacted command',
  () => {
    const [
      row,
    ] =
      adapt(
        softwareEvent({
          type:
            'command.started',

          status:
            'running',

          title:
            'Running command',

          summary:
            'npm run build',
        }),
      );

    assert.equal(
      row.text,
      'Running npm run build',
    );

    assert.equal(
      row.level,
      'info',
    );
  },
);

test(
  'Agent V2 command output is carried in the terminal body',
  () => {
    const [
      row,
    ] =
      adapt(
        softwareEvent({
          type:
            'command.output',

          status:
            'running',

          title:
            'Command output',

          summary:
            [
              '> app@1.0.0 build',
              '✓ Compiled successfully',
            ].join(
              '\n',
            ),

          evidence: {
            commandId:
              'command-1',
          },
        }),
      );

    assert.equal(
      row.text,
      'Command output',
    );

    assert.match(
      row.body ??
        '',
      /Compiled successfully/,
    );
  },
);

test(
  'Agent V2 command completion displays exit code and duration',
  () => {
    const [
      row,
    ] =
      adapt(
        softwareEvent({
          type:
            'command.completed',

          status:
            'success',

          title:
            'Command completed',

          summary:
            'npm run build',

          evidence: {
            commandId:
              'command-1',

            exitCode:
              0,

            durationMs:
              1340,
          },
        }),
      );

    assert.equal(
      row.text,
      'Command completed · exit 0 · 1.3s',
    );

    assert.equal(
      row.body,
      'npm run build',
    );

    assert.equal(
      row.level,
      'success',
    );
  },
);

test(
  'failed command is visibly marked as an error',
  () => {
    const [
      row,
    ] =
      adapt(
        softwareEvent({
          type:
            'command.completed',

          status:
            'failed',

          title:
            'Command failed',

          summary:
            'npm test',

          evidence: {
            commandId:
              'command-2',

            exitCode:
              1,

            durationMs:
              430,
          },
        }),
      );

    assert.equal(
      row.level,
      'error',
    );

    assert.match(
      row.text,
      /exit 1/,
    );
  },
);

test(
  'project check success appears as verified activity',
  () => {
    const [
      row,
    ] =
      adapt(
        softwareEvent({
          type:
            'check.completed',

          status:
            'success',

          title:
            'Project checks passed',
        }),
      );

    assert.equal(
      row.text,
      'Project checks passed',
    );

    assert.equal(
      row.level,
      'success',
    );
  },
);

test(
  'project check failure appears as an error',
  () => {
    const [
      row,
    ] =
      adapt(
        softwareEvent({
          type:
            'check.completed',

          status:
            'failed',

          title:
            '2 project checks failed',
        }),
      );

    assert.equal(
      row.level,
      'error',
    );
  },
);

test(
  'repair events are surfaced instead of hidden',
  () => {
    const [
      row,
    ] =
      adapt(
        softwareEvent({
          type:
            'repair.started',

          status:
            'running',

          title:
            'Repairing failed verification',
        }),
      );

    assert.equal(
      row.text,
      'Repairing failed verification',
    );
  },
);

test(
  'preview verification success is visible',
  () => {
    const [
      row,
    ] =
      adapt(
        softwareEvent({
          type:
            'preview.ready',

          status:
            'success',

          title:
            'Preview verified',
        }),
      );

    assert.equal(
      row.text,
      'Preview verified',
    );

    assert.equal(
      row.level,
      'success',
    );
  },
);

test(
  'browser verification failure surfaces its blocker',
  () => {
    const [
      row,
    ] =
      adapt(
        softwareEvent({
          type:
            'browser.verification.completed',

          status:
            'failed',

          title:
            'Browser verification incomplete',

          summary:
            'Application did not become reachable.',
        }),
      );

    assert.equal(
      row.level,
      'error',
    );

    assert.equal(
      row.body,
      'Application did not become reachable.',
    );
  },
);

test(
  'Agent V2 run.completed remains a status event because outer pipeline continues',
  () => {
    const [
      row,
    ] =
      adapt(
        softwareEvent({
          type:
            'run.completed',

          status:
            'success',

          title:
            'Software implementation verified',
        }),
      );

    /*
     * Critical:
     *
     * `result` would terminate TerminalRunState before Xroga's outer
     * validation/commit/deployment phases finish.
     */
    assert.equal(
      row.kind,
      'status',
    );

    assert.equal(
      row.level,
      'success',
    );
  },
);

test(
  'invalid Agent V2 object safely falls back to normal progress',
  () => {
    const [
      row,
    ] =
      adaptTerminalEvent(
        'progress',

        {
          agent:
            'builder',

          softwareAgentV2:
            true,

          softwareEvent: {
            type:
              'totally.invalid',
          },

          swarmActivity:
            'Building project',
        },

        {
          fromSeq:
            0,

          now:
            1000,
        },
      );

    assert.equal(
      row.text,
      'Building project',
    );
  },
);

test(
  'command output is redacted again at the frontend boundary',
  () => {
    const secret =
      `ghp_${'a'.repeat(
        36,
      )}`;

    const [
      row,
    ] =
      adapt(
        softwareEvent({
          type:
            'command.output',

          status:
            'running',

          title:
            'Command output',

          summary:
            `GITHUB_TOKEN=${secret}`,
        }),
      );

    assert.doesNotMatch(
      row.body ??
        '',
      /ghp_/,
    );
  },
);
