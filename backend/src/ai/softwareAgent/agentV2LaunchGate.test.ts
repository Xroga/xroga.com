import assert from 'node:assert/strict';
import {
  readFileSync,
} from 'node:fs';
import {
  test,
} from 'node:test';

import {
  readUniversalAgentFlags,
  routeProject,
} from '../../config/universalAgentFlags.js';

import {
  selectSoftwareExecutor,
} from './softwareExecutorSelector.js';

function repoFile(
  path: string,
): string {
  return readFileSync(
    new URL(
      `../../../../${path}`,
      import.meta.url,
    ),
    'utf8',
  );
}

test(
  'production rollout selects Universal engineering for stable projects',
  () => {
    const flags =
      readUniversalAgentFlags({
        UNIVERSAL_AGENT_ENABLED:
          'default',

        UNIVERSAL_AGENT_PERCENTAGE:
          '100',
      });

    assert.equal(
      flags.mode,
      'default',
    );

    const decision =
      routeProject(
        'xroga/e2e:main:/',
        flags,
      );

    assert.equal(
      decision.useUniversal,
      true,
    );

    assert.equal(
      decision.shadow,
      false,
    );
  },
);

test(
  'software executor cannot fall back to legacy implementation',
  () => {
    assert.equal(
      selectSoftwareExecutor(),
      'agent_v2',
    );

    /*
     * Old compatibility flags must not be able to resurrect the retired
     * implementation engine.
     */
    assert.equal(
      selectSoftwareExecutor({
        forceLegacy:
          true,
      }),
      'agent_v2',
    );

    assert.equal(
      selectSoftwareExecutor({
        forceAgentV2:
          false,
      }),
      'agent_v2',
    );
  },
);

test(
  'Fly production configuration enables Universal Agent V2 rollout',
  () => {
    const fly =
      repoFile(
        'fly.api.toml',
      );

    assert.match(
      fly,
      /UNIVERSAL_AGENT_ENABLED\s*=\s*['"]default['"]/,
    );

    assert.match(
      fly,
      /UNIVERSAL_AGENT_PERCENTAGE\s*=\s*['"]100['"]/,
    );

    assert.match(
      fly,
      /XROGA_SANDBOX_FLY_APP\s*=\s*['"]xroga-sandbox['"]/,
    );

    assert.match(
      fly,
      /XROGA_SANDBOX_BROWSER_IMAGE\s*=\s*['"][^'"]+playwright[^'"]*['"]/i,
    );

    assert.match(
      fly,
      /auto_stop_machines\s*=\s*false/,
    );
  },
);

test(
  'Universal implementation is wired to Agent V2 runtime and telemetry',
  () => {
    const adapter =
      repoFile(
        'backend/src/synthesis/softwareAgentImplementationAdapter.ts',
      );

    assert.match(
      adapter,
      /runSoftwareAgentRuntime/,
    );

    assert.match(
      adapter,
      /createXrogaAgentModelRoute/,
    );

    assert.match(
      adapter,
      /SwarmRunSoftwareEventSink/,
    );

    assert.match(
      adapter,
      /builderVersion:\s*['"]agent-v2['"]/,
    );

    assert.match(
      adapter,
      /fallbackUsed/,
    );

    assert.match(
      adapter,
      /actualModelsUsed/,
    );

    assert.match(
      adapter,
      /actualProvidersUsed/,
    );

    assert.match(
      adapter,
/runtime\s*\.\s*result\s*\.\s*status\s*!==\s*['"]verified['"]/
    );

    /*
     * The compatibility field may still exist in the input type, but it
     * must never be called.
     */
    assert.doesNotMatch(
      adapter,
      /runLegacy\s*\?\.\s*\(/,
    );

    assert.doesNotMatch(
      adapter,
      /await\s+input\.runLegacy\s*\(/,
    );
  },
);

test(
  'Agent V2 provider fallback records the model that actually succeeded',
  () => {
    const model =
      repoFile(
        'backend/src/ai/softwareAgent/xrogaAgentModel.ts',
      );

    assert.match(
      model,
      /executeWithProviderFallback/,
    );

    assert.match(
      model,
      /actualModelId/,
    );

    assert.match(
      model,
      /actualProvider/,
    );

    assert.match(
      model,
      /fallbackUsed/,
    );

    assert.match(
      model,
      /fallbackReason/,
    );

    assert.match(
      model,
      /outcome\.modelId/,
    );

    assert.match(
      model,
      /outcome\.failures/,
    );
  },
);

test(
  'Agent V2 events use the existing durable swarm progress transport',
  () => {
    const sink =
      repoFile(
        'backend/src/ai/softwareAgent/swarmRunSoftwareEventSink.ts',
      );

    const pipeline =
      repoFile(
        'backend/src/ai/pipeline.ts',
      );

    const route =
      repoFile(
        'backend/src/routes/swarm.ts',
      );

    assert.match(
      sink,
      /softwareRunEventToProgress/,
    );

    assert.match(
      sink,
      /builderVersion:\s*['"]agent-v2['"]/,
    );

    assert.match(
      sink,
      /softwareAgentV2:\s*true/,
    );

    assert.match(
      pipeline,
      /softwareRunEventToProgress/,
    );

    assert.match(
      pipeline,
      /onEvent:/,
    );

    assert.match(
      route,
      /appendRunEvent\s*\(/,
    );

    assert.match(
      route,
      /event:\s*['"]progress['"]/,
    );

    assert.match(
      route,
      /sendSSE\s*\(/,
    );
  },
);

test(
  'frontend renders public Agent V2 files commands checks and browser evidence',
  () => {
    const adapter =
      repoFile(
        'frontend/src/lib/terminal/terminalEventAdapter.ts',
      );

    const activity =
      repoFile(
        'frontend/src/components/terminal/TerminalLiveActivity.tsx',
      );

    assert.match(
      adapter,
      /softwareAgentV2/,
    );

    assert.match(
      adapter,
      /softwareEvent/,
    );

    assert.match(
      adapter,
      /command\.output/,
    );

    assert.match(
      adapter,
      /check\.completed/,
    );

    assert.match(
      adapter,
      /repair\.started/,
    );

    assert.match(
      adapter,
      /preview\.ready/,
    );

    assert.match(
      adapter,
      /browser\.verification\.completed/,
    );

    assert.match(
      activity,
      /event\.body/,
    );

    assert.match(
      activity,
      /terminal-event-body/,
    );
  },
);
