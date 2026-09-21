import {
  readFileSync,
} from 'node:fs';

import {
  test,
} from 'node:test';

import assert from 'node:assert/strict';

function source(
  relative:
    string,
): string {
  return readFileSync(
    new URL(
      relative,
      import.meta.url,
    ),

    'utf8',
  );
}

test(
  'streamSwarmExecute reuses an explicit interrupted run id',
  () => {
    const api =
      source(
        '../api.ts',
      );

    assert.match(
      api,
      /options\.runId\s*\?\?/,
    );

    assert.match(
      api,
      /clientRunId\s*\?\s*\{\s*runId:\s*clientRunId\s*\}/s,
    );
  },
);

test(
  'a stopped assistant message preserves its backend run id',
  () => {
    const context =
      source(
        '../../context/TerminalChatContext.tsx',
      );

    assert.match(
      context,
      /stoppedRunId\?:\s*string/,
    );

    assert.match(
      context,
      /stoppedRunId:\s*activeRunIdRef\.current/s,
    );
  },
);

test(
  'Retry sends the preserved run id back through submit',
  () => {
    const context =
      source(
        '../../context/TerminalChatContext.tsx',
      );

    const start =
      context.indexOf(
        'const retryStoppedBuild',
      );

    assert.ok(
      start >=
        0,
    );

    const section =
      context.slice(
        start,
        start +
          5_000,
      );

    assert.match(
      section,
      /msg\.stoppedRunId/,
    );
  },
);

test(
  'the build request marks an explicit same-run resume',
  () => {
    const context =
      source(
        '../../context/TerminalChatContext.tsx',
      );

    assert.match(
      context,
      /resumeRun:\s*Boolean\(\s*resumeRunId/s,
    );

    assert.match(
      context,
      /runId:\s*resumeRunId/s,
    );
  },
);
