import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';

import {
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
  SwarmRunSoftwareEventSink,
} from './swarmRunSoftwareEventSink.js';

test(
  'Software Agent V2 events are mirrored into durable swarm run history',
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
        },
      );

    const event:
      SoftwareRunEvent = {
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
    };

    await sink.emit(event);

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
        Record<string, unknown>;

    assert.equal(
      softwareEvent.type,
      'file.updated',
    );

    assert.equal(
      softwareEvent.runId,
      runId,
    );

    assert.deepEqual(
      softwareEvent.evidence,
      {
        filePath:
          'src/App.tsx',

        fileRevision:
          'revision-2',
      },
    );
  },
);
