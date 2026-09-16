import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';

import {
  appendRunEvent,
  createRun,
  getRun,
} from '../runStore.js';

import {
  InMemorySoftwareRunEventSink,
} from './runEvents.js';

import type {
  SoftwareRunEvent,
} from './runEvents.js';

import {
  softwareRunEventToProgress,
  SwarmRunSoftwareEventSink,
} from './swarmRunSoftwareEventSink.js';

function createSoftwareEvent(
  runId: string,
  overrides: Partial<SoftwareRunEvent> = {},
): SoftwareRunEvent {
  return {
    id:
      randomUUID(),

    runId,

    sequence:
      1,

    createdAt:
      new Date().toISOString(),

    type:
      'file.updated',

    status:
      'running',

    title:
      'Updated application shell',

    summary:
      'src/App.tsx',

    evidence: {
      filePath:
        'src/App.tsx',

      fileRevision:
        'revision-2',
    },

    ...overrides,
  };
}

test(
  'observer path persists exactly once through the outer pipeline',
  async () => {
    const runId =
      randomUUID();

    const userId =
      randomUUID();

    createRun(
      userId,
      'Build a production dashboard',
      runId,
    );

    const mirror =
      new InMemorySoftwareRunEventSink();

    const observed:
      SoftwareRunEvent[] =
      [];

    const sink =
      new SwarmRunSoftwareEventSink(
        mirror,

        (event) => {
          observed.push(event);

          /*
           * Simulates pipeline.emit()
           *   -> swarm route onProgress
           *   -> appendRunEvent()
           */
          appendRunEvent(
            runId,
            'progress',
            softwareRunEventToProgress(
              event,
            ),
          );
        },
      );

    await sink.emit(
      createSoftwareEvent(
        runId,
      ),
    );

    assert.equal(
      mirror.getEvents().length,
      1,
    );

    assert.equal(
      observed.length,
      1,
    );

    const run =
      getRun(runId);

    assert.ok(run);

    /*
     * Critical assertion:
     *
     * If this becomes 2, Agent V2 events are being persisted twice.
     */
    assert.equal(
      run.events.length,
      1,
    );

    const persisted =
      run.events[0];

    assert.ok(persisted);

    assert.equal(
      persisted.type,
      'progress',
    );

    assert.equal(
      persisted.data.agent,
      'builder',
    );

    assert.equal(
      persisted.data.status,
      'file.updated',
    );

    assert.equal(
      persisted.data.builderVersion,
      'agent-v2',
    );

    assert.equal(
      persisted.data.softwareAgentV2,
      true,
    );

    const softwareEvent =
      persisted.data.softwareEvent as
        SoftwareRunEvent;

    assert.equal(
      softwareEvent.type,
      'file.updated',
    );

    assert.equal(
      softwareEvent.runId,
      runId,
    );

    assert.equal(
      softwareEvent.evidence?.filePath,
      'src/App.tsx',
    );
  },
);

test(
  'without observer Agent V2 persists directly to run history',
  async () => {
    const runId =
      randomUUID();

    const userId =
      randomUUID();

    createRun(
      userId,
      'Build an API',
      runId,
    );

    const sink =
      new SwarmRunSoftwareEventSink();

    await sink.emit(
      createSoftwareEvent(
        runId,
        {
          type:
            'command.completed',

          title:
            'Production build completed',

          summary:
            'npm run build',

          evidence: {
            commandId:
              'command-1',

            exitCode:
              0,

            durationMs:
              1250,
          },
        },
      ),
    );

    const run =
      getRun(runId);

    assert.ok(run);

    assert.equal(
      run.events.length,
      1,
    );

    assert.equal(
      run.events[0]?.data.status,
      'command.completed',
    );

    assert.equal(
      run.events[0]?.data.builderVersion,
      'agent-v2',
    );

    const softwareEvent =
      run.events[0]?.data.softwareEvent as
        SoftwareRunEvent;

    assert.equal(
      softwareEvent.evidence?.exitCode,
      0,
    );
  },
);
