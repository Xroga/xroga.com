import assert from 'node:assert/strict';
import {
  describe,
  it,
} from 'node:test';

import {
  isBuildPrompt,
  routePrompt,
} from './router.js';

describe(
  'routePrompt',
  () => {
    it(
      'routes ordinary crypto application engineering to GLM-5.3',
      () => {
        const route =
          routePrompt(
            'build a crypto staking dashboard with wallet connect',
          );

        assert.equal(
          route.builder,
          'glm_5_3',
        );

        assert.equal(
          route.converter,
          'deepseek_v4_flash',
        );
      },
    );

    it(
      'reserves Kimi K3 for rare principal-level systems work',
      () => {
        const route =
          routePrompt(
            'design a new compiler and operating system kernel from scratch',
          );

        assert.equal(
          route.builder,
          'kimi_k3',
        );
      },
    );

    it(
      'routes long-horizon repository work to GLM-5.3',
      () => {
        const route =
          routePrompt(
            'refactor this entire large codebase repository',
          );

        assert.equal(
          route.builder,
          'glm_5_3',
        );
      },
    );

    it(
      'routes simple builds to GLM-5.3 Flash',
      () => {
        const route =
          routePrompt(
            'build a simple landing page for a coffee shop',
          );

        assert.equal(
          route.builder,
          'glm_5_3_flash',
        );
      },
    );

    it(
      'routes normal unknown-category builds to GLM-5.3 Flash',
      () => {
        const route =
          routePrompt(
            'build a lunar moss accounting engine',
          );

        assert.equal(
          route.builder,
          'glm_5_3_flash',
        );

        assert.equal(
          route.classification.primaryIntent,
          'build',
        );
      },
    );

    it(
      'routes file analysis to GLM-5.3 Flash',
      () => {
        const route =
          routePrompt(
            'analyze this PDF document upload',
          );

        assert.equal(
          route.kind,
          'file_analysis',
        );

        assert.equal(
          route.builder,
          'glm_5_3_flash',
        );
      },
    );

    it(
      'routes generic research synthesis to GLM-5.3 Flash',
      () => {
        const route =
          routePrompt(
            'research the latest public transport API changes with current sources',
          );

        assert.equal(
          route.kind,
          'research',
        );

        assert.equal(
          route.builder,
          'glm_5_3_flash',
        );

        assert.equal(
          route.useResearch,
          true,
        );
      },
    );

    it(
      'does not use Grok as final synthesis for X-native research',
      () => {
        const route =
          routePrompt(
            'research current X.com posts about a new API release with sources',
          );

        assert.equal(
          route.builder,
          'glm_5_3_flash',
        );

        assert.notEqual(
          route.builder,
          'grok_4_3',
        );

        assert.notEqual(
          route.builder,
          'grok_4_5',
        );
      },
    );

    it(
      'keeps ordinary chat on DeepSeek Flash',
      () => {
        const route =
          routePrompt(
            'explain what a database index is',
          );

        assert.equal(
          route.kind,
          'chat',
        );

        assert.equal(
          route.builder,
          'deepseek_v4_flash',
        );
      },
    );

    it(
      'detects build prompts',
      () => {
        assert.equal(
          isBuildPrompt(
            'build me a website',
          ),
          true,
        );

        assert.equal(
          isBuildPrompt(
            'what is staking',
          ),
          false,
        );
      },
    );

    it(
      'does not turn pure research into a build',
      () => {
        const route =
          routePrompt(
            'research current public transport data APIs with sources',
          );

        assert.equal(
          route.kind,
          'research',
        );

        assert.equal(
          route.classification.requiresCoding,
          false,
        );
      },
    );
  },
);
