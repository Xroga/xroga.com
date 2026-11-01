import {
  readFileSync,
} from 'node:fs';

import {
  describe,
  it,
} from 'node:test';

import assert from 'node:assert/strict';

import {
  mayWrite,
  routeProject,
} from '../../config/universalAgentFlags.js';

function source(
  path:
    string,
): string {
  return readFileSync(
    new URL(
      path,
      import.meta.url,
    ),

    'utf8',
  );
}

describe(
  'Step 7C legacy retirement',
  () => {
    it(
      'routes production retirement traffic through Universal Agent V2',
      () => {
        const decision =
          routeProject(
            'run:greenfield-1',

            {
              mode:
                'retirement',

              percentage:
                100,

              allowlist:
                [],
            },
          );

        assert.equal(
          decision.useUniversal,
          true,
        );

        assert.equal(
          decision.shadow,
          false,
        );

        assert.equal(
          mayWrite(
            decision,
          ),
          true,
        );
      },
    );

    it(
      'keeps explicit operator legacy mode as the emergency rollback',
      () => {
        const decision =
          routeProject(
            'project-rollback',

            {
              mode:
                'legacy',

              percentage:
                100,

              allowlist:
                [],
            },
          );

        assert.equal(
          decision.useUniversal,
          false,
        );

        assert.equal(
          decision.shadow,
          false,
        );

        assert.equal(
          mayWrite(
            decision,
          ),
          false,
        );
      },
    );

    it(
      'uses the generated canonical run identity for greenfield routing',
      () => {
        const pipeline =
          source(
            '../../ai/pipeline.ts',
          );

        const identityStart =
          pipeline.indexOf(
            'const canonicalProjectId =',
          );

        const routingStart =
          pipeline.indexOf(
            'const universalDecision =',
          );

        assert.ok(
          identityStart >=
            0,
        );

        assert.ok(
          routingStart >
            identityStart,
        );

        const routing =
          pipeline.slice(
            routingStart,
            routingStart +
              6_000,
          );

        assert.match(
          routing,
          /routeProject\(canonicalProjectId[,)]/,
        );

        assert.match(
          routing,
          /projectId:\s*canonicalProjectId/,
        );

        assert.doesNotMatch(
          routing,
          /routeProject\(resolvedProjectId[,)]/,
        );
      },
    );

    it(
      'removes the legacy implementation callback from the universal agent',
      () => {
        const entry =
          source(
            '../universalEntrypoint.ts',
          );

        const adapter =
          source(
            '../softwareAgentImplementationAdapter.ts',
          );

        assert.doesNotMatch(
          entry,
          /runLegacy/,
        );

        assert.doesNotMatch(
          entry,
          /implementCoherently/,
        );

        assert.doesNotMatch(
          adapter,
          /runLegacy/,
        );
      },
    );

    it(
      'preserves the historical retirement settings and refuses new Fly deployments',
      () => {
        const fly =
          source(
            '../../../../fly.api.toml',
          );

        const workflow =
          source(
            '../../../../.github/workflows/fly-deploy.yml',
          );

        assert.match(
          fly,
          /UNIVERSAL_AGENT_ENABLED\s*=\s*['"]retirement['"]/,
        );

        assert.match(
          fly,
          /UNIVERSAL_AGENT_PERCENTAGE\s*=\s*['"]100['"]/,
        );

        assert.doesNotMatch(
          fly,
          /UNIVERSAL_AGENT_ENABLED\s*=\s*['"]default['"]/,
        );

        // The old rollout workflow is retired. Its replacement must remain a
        // manual refusal, with no deploy command, credential or push trigger.
        assert.match(workflow, /name: Retired Fly deployment/);
        assert.match(workflow, /workflow_dispatch:/);
        assert.match(workflow, /exit 1/);
        assert.match(workflow, /docs\/operations\/google-production-migration\.md/);
        assert.doesNotMatch(workflow, /\b(?:push|pull_request):/);
        assert.doesNotMatch(workflow, /flyctl|fly\s+deploy|FLY_API_TOKEN|secrets\./);
      },
    );
  },
);
