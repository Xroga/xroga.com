import {
  describe,
  it,
} from 'node:test';

import assert from 'node:assert/strict';

import {
  goalContractSchema,
} from '../ai/universal/goalContract.js';

import {
  semanticExecutionPrompt,
} from './semanticExecutionPrompt.js';

describe(
  'semanticExecutionPrompt',
  () => {
    it(
      'makes the resolved semantic goal authoritative over a vague latest message',
      () => {
        const goal =
          goalContractSchema.parse({
            version:
              '1.0',

            goal:
              'Build a polished responsive landing page named Jhon Mix.',

            desiredOutcome:
              'A working browser-rendered Jhon Mix landing page in the connected repository.',

            semanticIntent:
              'MODIFY',

            constraints:
              [
                'Preserve the connected repository architecture.',
              ],

            acceptance:
              [
                'The application builds successfully.',
                'Browser Preview passes.',
              ],

            historyContext:
              [
                'The earlier user request was to build the Jhon Mix landing page.',
              ],

            projectContext:
              null,

            deliverables:
              [],

            requiredCapabilities:
              [
                'software.implement',
                'validation.run',
              ],

            requiredAuthorities:
              [],

            risks:
              [],

            confidence:
              0.95,

            blockers:
              [],

            contextComplexity:
              'low',
          });

        const result =
          semanticExecutionPrompt(
            goal,
            'finish that',
          );

        assert.match(
          result,
          /Build a polished responsive landing page named Jhon Mix/,
        );

        assert.match(
          result,
          /Browser Preview passes/,
        );

        assert.match(
          result,
          /Latest user message for provenance only:\nfinish that/,
        );

        assert.equal(
          result.startsWith(
            'finish that',
          ),
          false,
        );
      },
    );

    it(
      'does not duplicate an already explicit current request',
      () => {
        const goal =
          goalContractSchema.parse({
            version:
              '1.0',

            goal:
              'Build a landing page.',

            desiredOutcome:
              'Build a landing page.',

            semanticIntent:
              'MODIFY',

            constraints:
              [],

            acceptance:
              [],

            historyContext:
              [],

            projectContext:
              null,

            deliverables:
              [],

            requiredCapabilities:
              [
                'software.implement',
              ],

            requiredAuthorities:
              [],

            risks:
              [],

            confidence:
              1,

            blockers:
              [],

            contextComplexity:
              'low',
          });

        assert.equal(
          semanticExecutionPrompt(
            goal,
            'Build a landing page.',
          ),

          'Build a landing page.',
        );
      },
    );
  },
);
