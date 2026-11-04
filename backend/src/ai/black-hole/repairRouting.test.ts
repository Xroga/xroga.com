import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  classifyFailure,
  escalateScope,
  routeRepair,
  type RepairFailureKind,
} from './repairRouting.js';

import {
  blackHoleModel,
} from './registry.js';

test(
  'repair assignments use one default with no implicit premium authority',
  () => {
    assert.deepEqual(
      routeRepair(
        'type_error',
      ).preferredModels,
      ['deepseek_v4_1_flash_1017'],
    );

    assert.deepEqual(
      routeRepair(
        'structural_failure',
      ).preferredModels,
      ['deepseek_v4_1_flash_1017'],
    );

    const visual =
      routeRepair(
        'visual_mismatch',
      );

    assert.deepEqual(
      visual.preferredModels,
      ['deepseek_v4_1_flash_1017'],
    );

    assert.equal(
      visual.needsVision,
      true,
    );

    assert.equal(
      visual.taskClass,
      'vision',
    );
  },
);

test(
  'no repair route names a research model',
  () => {
    const kinds:
      RepairFailureKind[] = [
        'type_error',
        'compile_error',
        'lint_error',
        'test_failure',
        'runtime_error',
        'dependency_error',
        'structural_failure',
        'visual_mismatch',
        'security_finding',
        'deployment_failure',
      ];

    for (
      const kind of kinds
    ) {
      for (
        const modelId of
        routeRepair(
          kind,
        ).preferredModels
      ) {
        const model =
          blackHoleModel(
            modelId,
          );

        assert.ok(
          model,
          `${modelId} missing from canonical registry`,
        );

        assert.equal(
          model!.authority
            .writeProjectFiles,
          true,
          `${modelId} lacks write authority but was offered for ${kind}`,
        );
      }
    }
  },
);

test(
  'mechanical failures start with the cheapest capable route',
  () => {
    assert.equal(
      routeRepair(
        'lint_error',
      ).preferredModels[0],
      'deepseek_v4_1_flash_1017',
    );

    assert.equal(
      routeRepair(
        'type_error',
      ).preferredModels[0],
      'deepseek_v4_1_flash_1017',
    );
  },
);

test(
  'normal repair uses the default',
  () => {
    assert.equal(
      routeRepair(
        'test_failure',
      ).preferredModels[0],
      'deepseek_v4_1_flash_1017',
    );

    assert.equal(
      routeRepair(
        'runtime_error',
      ).preferredModels[0],
      'deepseek_v4_1_flash_1017',
    );

    assert.equal(
      routeRepair(
        'deployment_failure',
      ).preferredModels[0],
      'deepseek_v4_1_flash_1017',
    );
  },
);

test(
  'structural and security repair cannot implicitly purchase premium',
  () => {
    assert.equal(
      routeRepair(
        'structural_failure',
      ).preferredModels[0],
      'deepseek_v4_1_flash_1017',
    );

    assert.equal(
      routeRepair(
        'security_finding',
      ).preferredModels[0],
      'deepseek_v4_1_flash_1017',
    );
  },
);

test(
  'local failures do not justify whole-product regeneration',
  () => {
    assert.equal(
      routeRepair(
        'type_error',
      ).scope,
      'single_file',
    );

    assert.equal(
      routeRepair(
        'lint_error',
      ).scope,
      'single_file',
    );

    assert.equal(
      routeRepair(
        'test_failure',
      ).scope,
      'affected_files',
    );
  },
);

test(
  'dependency conflicts remain project scoped',
  () => {
    assert.equal(
      routeRepair(
        'dependency_error',
      ).scope,
      'project',
    );
  },
);

test(
  'scope escalation is bounded',
  () => {
    assert.equal(
      escalateScope(
        'single_file',
        1,
      ),
      'single_file',
    );

    assert.equal(
      escalateScope(
        'single_file',
        2,
      ),
      'single_file',
    );

    assert.equal(
      escalateScope(
        'single_file',
        3,
      ),
      'affected_files',
    );

    assert.equal(
      escalateScope(
        'affected_files',
        3,
      ),
      'module',
    );

    assert.equal(
      escalateScope(
        'module',
        3,
      ),
      'project',
    );

    assert.equal(
      escalateScope(
        'project',
        9,
      ),
      'project',
    );
  },
);

test(
  'failures are classified deterministically',
  () => {
    assert.equal(
      classifyFailure(
        "TS2345: Argument of type 'string' is not assignable",
      ),
      'type_error',
    );

    assert.equal(
      classifyFailure(
        'Cannot find module "react-dom"',
      ),
      'dependency_error',
    );

    assert.equal(
      classifyFailure(
        'ERESOLVE unable to resolve dependency tree',
      ),
      'dependency_error',
    );

    assert.equal(
      classifyFailure(
        'eslint: no-unused-vars',
      ),
      'lint_error',
    );

    assert.equal(
      classifyFailure(
        '2 tests failed',
      ),
      'test_failure',
    );

    assert.equal(
      classifyFailure(
        'screenshot does not match the design',
      ),
      'visual_mismatch',
    );

    assert.equal(
      classifyFailure(
        'CVE-2024-1234 in transitive dependency',
      ),
      'security_finding',
    );

    assert.equal(
      classifyFailure(
        'Vercel deployment failed: build command failed',
      ),
      'deployment_failure',
    );

    assert.equal(
      classifyFailure(
        'SyntaxError: unexpected token',
      ),
      'compile_error',
    );

    assert.equal(
      classifyFailure(
        'circular import detected across modules',
      ),
      'structural_failure',
    );
  },
);

test(
  'unknown failures default to bounded runtime repair',
  () => {
    const kind =
      classifyFailure(
        'something went wrong',
      );

    assert.equal(
      kind,
      'runtime_error',
    );

    assert.notEqual(
      routeRepair(
        kind,
      ).scope,
      'project',
    );
  },
);
