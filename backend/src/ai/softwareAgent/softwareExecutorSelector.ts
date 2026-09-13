import {
  getSoftwareAgentFeatureFlags,
} from './softwareAgentFeatureFlags.js';

export type SoftwareExecutorKind =
  | 'legacy'
  | 'agent_v2'
  | 'agent_v2_shadow';

export interface SelectSoftwareExecutorInput {
  /**
   * Allows internal/test callers to force legacy behavior
   * regardless of environment flags.
   */
  forceLegacy?: boolean;

  /**
   * Allows controlled internal testing of V2 without globally
   * enabling it.
   *
   * Do not expose this directly to normal client requests.
   */
  forceAgentV2?: boolean;
}

export function selectSoftwareExecutor(
  input: SelectSoftwareExecutorInput = {},
): SoftwareExecutorKind {
  if (input.forceLegacy) {
    return 'legacy';
  }

  if (input.forceAgentV2) {
    return 'agent_v2';
  }

  const flags =
    getSoftwareAgentFeatureFlags();

  if (!flags.enabled) {
    return 'legacy';
  }

  if (flags.shadowMode) {
    return 'agent_v2_shadow';
  }

  return 'agent_v2';
}
