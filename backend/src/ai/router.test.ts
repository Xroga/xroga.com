import assert from 'node:assert/strict';
import {
  describe,
  it,
} from 'node:test';

import {
  isBuildPrompt,
  routePrompt,
  routeReadOnlyConversation,
} from './router.js';

describe('admitted read-only synthesis', () => {
  it('uses DeepSeek for public and X evidence without removing the retrieval requirement', () => {
    for (const capability of ['research.public-web', 'research.x']) {
      const route = routeReadOnlyConversation('Explain the verified evidence.', {
        requiredCapabilities: [capability], freshnessRequirement: 'NONE',
      });
      assert.equal(route.kind, 'research');
      assert.equal(route.builder, 'deepseek_v4_flash');
      assert.equal(route.useResearch, true);
    }
  });
  it('keeps freshness-required retrieval and ordinary no-research answers distinct', () => {
    const current = routeReadOnlyConversation('What changed?', {
      requiredCapabilities: ['conversation.respond'], freshnessRequirement: 'CURRENT_REQUIRED',
    });
    assert.equal(current.kind, 'research');
    assert.equal(current.useResearch, true);
    const plain = routeReadOnlyConversation('Explain a SaaS architecture, do not build it.', {
      requiredCapabilities: ['conversation.respond'], freshnessRequirement: 'NONE',
    });
    assert.equal(plain.kind, 'chat');
    assert.equal(plain.builder, 'deepseek_v4_flash');
    assert.equal(plain.useResearch, false);
  });
  it('preserves the existing legacy build routing when no semantic contract is supplied', () => {
    const prompt = 'build a simple landing page';
    assert.deepEqual(routeReadOnlyConversation(prompt), routePrompt(prompt));
  });
});

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
      'routes generic research synthesis to primary DeepSeek while preserving retrieval',
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
          'deepseek_v4_flash',
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
          'deepseek_v4_flash',
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
