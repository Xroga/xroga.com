import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  terminalRunReducer,
} from './terminalRunReducer';

import {
  adaptTerminalEvent,
} from './terminalEventAdapter';

import {
  EMPTY_RUN_STATE,
  type TerminalEvent,
} from './terminalEvent';

function row(
  seq: number,
  over:
    Partial<
      TerminalEvent
    > = {},
): TerminalEvent {
  return {
    seq,
    kind:
      'status',
    level:
      'info',
    source:
      null,
    text:
      `row ${seq}`,
    body:
      null,
    at:
      0,
    rawEvent:
      'progress',
    ...over,
  };
}

test(
  'a started run records when it started',
  () => {
    const state =
      terminalRunReducer(
        EMPTY_RUN_STATE,
        {
          type:
            'run-started',
          at:
            1_000,
        },
      );

    assert.equal(
      state.startedAt,
      1_000,
    );

    assert.equal(
      state.active,
      true,
    );
  },
);

test(
  'an idle terminal has no start time',
  () => {
    assert.equal(
      EMPTY_RUN_STATE
        .startedAt,
      null,
    );
  },
);

test(
  'the start time survives incoming events',
  () => {
    let state =
      terminalRunReducer(
        EMPTY_RUN_STATE,
        {
          type:
            'run-started',
          at:
            1_000,
        },
      );

    state =
      terminalRunReducer(
        state,
        {
          type:
            'events',
          events: [
            row(1),
            row(2),
          ],
        },
      );

    assert.equal(
      state.startedAt,
      1_000,
    );
  },
);

test(
  'a second run restarts the clock',
  () => {
    let state =
      terminalRunReducer(
        EMPTY_RUN_STATE,
        {
          type:
            'run-started',
          at:
            1_000,
        },
      );

    state =
      terminalRunReducer(
        state,
        {
          type:
            'events',
          events: [
            row(1),
          ],
        },
      );

    state =
      terminalRunReducer(
        state,
        {
          type:
            'run-started',
          at:
            9_000,
        },
      );

    assert.equal(
      state.startedAt,
      9_000,
    );

    assert.deepEqual(
      state.events,
      [],
    );
  },
);

test(
  'the first backend event is the first visible activity state',
  () => {
    let state =
      terminalRunReducer(
        EMPTY_RUN_STATE,
        {
          type:
            'run-started',
          at:
            0,
        },
      );

    assert.equal(
      state.events
        .length,
      0,
    );

    const rows =
      adaptTerminalEvent(
        'progress',
        {
          agent:
            'session',
          status:
            'accepted',
          swarmActivity:
            'Request received',
        },
        {
          fromSeq:
            0,
        },
      );

    state =
      terminalRunReducer(
        state,
        {
          type:
            'events',
          events:
            rows,
        },
      );

    assert.equal(
      state.events
        .length,
      1,
    );

    assert.equal(
      state.events[0]
        .text,
      'Request received',
    );
  },
);

test(
  'the backend startup events survive the adapter',
  () => {
    const startup:
      Array<
        [
          string,
          string,
        ]
      > = [
        [
          'accepted',
          'Request received',
        ],
        [
          'checking_quota',
          'Checking your available actions',
        ],
        [
          'loading_history',
          'Loading project memory',
        ],
        [
          'reading_repository',
          'Reading your project files',
        ],
        [
          'repository_ready',
          'Loaded 12 project files',
        ],
        [
          'planning_route',
          'Planning the build route',
        ],
      ];

    for (
      const [
        status,
        activity,
      ] of startup
    ) {
      const rows =
        adaptTerminalEvent(
          'progress',
          {
            agent:
              'session',
            status,
            swarmActivity:
              activity,
          },
          {
            fromSeq:
              0,
          },
        );

      assert.equal(
        rows.length,
        1,
        status,
      );

      assert.equal(
        rows[0].text,
        activity,
        status,
      );
    }
  },
);

test(
  'a heartbeat reaches the terminal with its elapsed time intact',
  () => {
    const rows =
      adaptTerminalEvent(
        'progress',
        {
          agent:
            'builder',
          status:
            'awaiting_model',
          message:
            'Still waiting on Kimi K3 to return code — no output received yet (1m 1s).',
        },
        {
          fromSeq:
            0,
        },
      );

    assert.equal(
      rows.length,
      1,
    );

    assert.match(
      rows[0].text,
      /1m 1s/,
    );

    assert.doesNotMatch(
      rows[0].text,
      /Kimi/i,
    );

    assert.match(
      rows[0].text,
      /Black Hole ∞/,
    );
  },
);

test(
  'keepalives still produce no fabricated activity',
  () => {
    const rows =
      adaptTerminalEvent(
        'progress',
        {
          keepalive:
            true,
          message:
            'Working…',
        },
        {
          fromSeq:
            0,
        },
      );

    assert.deepEqual(
      rows,
      [],
    );
  },
);
