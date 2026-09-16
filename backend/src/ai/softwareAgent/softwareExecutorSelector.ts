export type SoftwareExecutorKind =
  'agent_v2';

export interface SelectSoftwareExecutorInput {
  /**
   * Retained temporarily for source compatibility with internal callers that
   * still construct the old migration options object.
   *
   * Agent V2 is authoritative now. This value is intentionally ignored and
   * cannot re-enable the legacy implementation path.
   */
  forceLegacy?: boolean;

  /**
   * Retained temporarily for source compatibility.
   *
   * Agent V2 no longer needs to be forced on because it is the only software
   * executor selected by this boundary.
   */
  forceAgentV2?: boolean;
}

/**
 * Authoritative software-executor selector.
 *
 * The migration period is over: software implementation always uses Agent V2.
 * Legacy and shadow execution are deliberately not selectable here, including
 * through environment variables or internal force flags.
 */
export function selectSoftwareExecutor(
  _input: SelectSoftwareExecutorInput = {},
): SoftwareExecutorKind {
  return 'agent_v2';
}
