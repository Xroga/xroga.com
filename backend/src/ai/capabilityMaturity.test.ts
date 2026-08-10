import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEGRADED_SUCCESS_RATE,
  VERIFICATION_GATES,
  assessMaturity,
  describeMaturity,
  isOfferable,
  type MaturityGates,
} from './capabilityMaturity.js';

/**
 * Command 3 §23 and §29C — capability maturity is derived from evidence, never asserted.
 *
 * The failure being prevented is optimistic self-assessment: infrastructure existing is not
 * a capability working, and "we built the adapter" reads very close to "the adapter is
 * verified" unless something forces the distinction.
 */

const ALL_GATES: MaturityGates = {
  runtimeAdapterExists: true,
  sandboxCanExecute: true,
  buildAndTestCommandsKnown: true,
  requiredBenchmarksExist: true,
  benchmarkThresholdsPass: true,
  securityTestsPass: true,
  productionMonitoringExists: true,
  rollbackExists: true,
};

test('a capability with no evidence at all is unsupported', () => {
  const record = assessMaturity({ kind: 'language', identifier: 'elixir' });
  assert.equal(record.state, 'unsupported');
  assert.equal(isOfferable(record), false);
  assert.match(record.reason, /cannot be attempted/);
});

test('an adapter alone is experimental, not supported', () => {
  // §23: universal architecture means Xroga can extend to new product types; it does not
  // mean they are already verified.
  const record = assessMaturity({
    kind: 'runtime_adapter',
    identifier: 'ruby',
    gates: { runtimeAdapterExists: true },
  });
  assert.equal(record.state, 'experimental');
  assert.equal(isOfferable(record), false);
  assert.match(describeMaturity(record), /no claim about the result can be checked/);
});

test('executable and measured but incomplete is beta', () => {
  const record = assessMaturity({
    kind: 'language',
    identifier: 'rust',
    gates: {
      runtimeAdapterExists: true,
      sandboxCanExecute: true,
      buildAndTestCommandsKnown: true,
      requiredBenchmarksExist: true,
    },
  });
  assert.equal(record.state, 'beta');
  assert.equal(isOfferable(record), true);
  assert.ok(record.unmetGates.includes('benchmarkThresholdsPass'));
  assert.ok(record.unmetGates.includes('rollbackExists'));
});

test('verified requires every gate, and no single gate may be waived', () => {
  assert.equal(assessMaturity({ kind: 'language', identifier: 'rust', gates: ALL_GATES }).state, 'verified');

  // Drop each gate in turn. None of them is optional.
  for (const gate of VERIFICATION_GATES) {
    const record = assessMaturity({
      kind: 'language',
      identifier: 'rust',
      gates: { ...ALL_GATES, [gate]: false },
    });
    assert.notEqual(record.state, 'verified', `${gate} was waivable`);
    assert.ok(record.unmetGates.includes(gate) || record.state === 'experimental', `${gate} not reported`);
  }
});

test('having benchmarks is not the same as passing them', () => {
  // The exact gap where an unearned "verified" would appear.
  const record = assessMaturity({
    kind: 'product_type',
    identifier: 'cli',
    gates: { ...ALL_GATES, benchmarkThresholdsPass: false },
  });
  assert.equal(record.state, 'beta');
  assert.deepEqual(record.unmetGates, ['benchmarkThresholdsPass']);
});

test('state cannot be asserted by the caller', () => {
  // There is no `state` field on the input; the type system prevents it and the runtime
  // ignores anything extra. This is the property that makes the module worth having.
  const record = assessMaturity({
    kind: 'language',
    identifier: 'cobol',
    ...({ state: 'verified' } as Record<string, unknown>),
  } as Parameters<typeof assessMaturity>[0]);
  assert.equal(record.state, 'unsupported');
});

test('a proven capability that starts failing is degraded, not beta', () => {
  const record = assessMaturity({
    kind: 'language',
    identifier: 'python',
    gates: ALL_GATES,
    observations: { samples: 20, validationSuccessRate: 0.4 },
  });
  assert.equal(record.state, 'degraded');
  assert.match(record.reason, /Previously verified/);
  assert.match(record.reason, /Current behaviour outranks/);
});

test('degradation needs enough samples to mean anything', () => {
  const record = assessMaturity({
    kind: 'language',
    identifier: 'python',
    gates: ALL_GATES,
    observations: { samples: 2, validationSuccessRate: 0 },
  });
  assert.equal(record.state, 'verified', 'two failures must not undo full gate evidence');
});

test('an experimental capability that fails is not called degraded', () => {
  // Degraded means something regressed. A capability never claimed to work cannot regress,
  // and conflating the two loses the fact that something used to pass.
  const record = assessMaturity({
    kind: 'runtime_adapter',
    identifier: 'ruby',
    gates: { runtimeAdapterExists: true },
    observations: { samples: 50, validationSuccessRate: 0.1 },
  });
  assert.equal(record.state, 'experimental');
});

test('the degradation floor is applied at its boundary', () => {
  const justBelow = assessMaturity({
    kind: 'language',
    identifier: 'go',
    gates: ALL_GATES,
    observations: { samples: 10, validationSuccessRate: DEGRADED_SUCCESS_RATE - 0.01 },
  });
  const atFloor = assessMaturity({
    kind: 'language',
    identifier: 'go',
    gates: ALL_GATES,
    observations: { samples: 10, validationSuccessRate: DEGRADED_SUCCESS_RATE },
  });
  assert.equal(justBelow.state, 'degraded');
  assert.equal(atFloor.state, 'verified');
});
