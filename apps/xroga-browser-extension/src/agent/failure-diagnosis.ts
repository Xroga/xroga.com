// Failure diagnosis: classify why a step failed from the layer's own error code, then give an ordered recovery chain.
// Adapted from browser-agent (https://github.com/uiuing/browser-agent, MIT), packages/extension/src/engine/orchestrator/healing.ts
// (diagnose -> strategy chain -> terminal check). The diagnosis names and the chain idea are upstream's; the codes, the directives and the
// terminal rules are Xroga's: a failure that needs the user, a policy decision or a missing capability is terminal and is never retried.
import type { ErrorCode } from '@src/browser-control/protocol/errors';

export type Diagnosis =
  | 'stale_reference'
  | 'element_not_found'
  | 'ambiguous_target'
  | 'occluded_or_blocked'
  | 'value_not_applied'
  | 'timeout_flaky'
  | 'navigation_problem'
  | 'needs_user'
  | 'policy_blocked'
  | 'invalid_call'
  | 'unknown';

export type HealStep = 'resnapshot' | 'smart_wait' | 'scroll_into_view' | 'dismiss_overlay' | 'refine_target' | 'switch_method' | 'reobserve_state' | 'ask_or_stop';

const CODE_TO_DIAGNOSIS: Partial<Record<ErrorCode, Diagnosis>> = {
  REF_UNKNOWN: 'stale_reference',
  REF_NOT_PRESENTED: 'stale_reference',
  REF_TAB_MISMATCH: 'stale_reference',
  STALE_DOCUMENT: 'stale_reference',
  NODE_DETACHED: 'stale_reference',
  TARGET_CHANGED: 'stale_reference',
  NO_MATCH: 'element_not_found',
  AMBIGUOUS_TARGET: 'ambiguous_target',
  MODAL_PENDING: 'occluded_or_blocked',
  NOT_VISIBLE: 'occluded_or_blocked',
  NOT_STABLE: 'timeout_flaky',
  DISABLED: 'value_not_applied',
  NOT_EDITABLE: 'value_not_applied',
  OBSCURED: 'occluded_or_blocked',
  INTERCEPTED: 'value_not_applied',
  NOT_INTERACTABLE: 'occluded_or_blocked',
  NO_SUCH_OPTION: 'element_not_found',
  AMBIGUOUS_OPTION: 'ambiguous_target',
  STATE_UNCHANGED: 'value_not_applied',
  TIMEOUT: 'timeout_flaky',
  NAVIGATION_FAILED: 'navigation_problem',
  FRAME_DETACHED: 'stale_reference',
  DEBUGGER_DETACHED: 'timeout_flaky',
  CAPTURE_FAILED: 'timeout_flaky',
  USER_DECLINED: 'needs_user',
  USER_STEP: 'needs_user',
  NEEDS_USER: 'needs_user',
  CONFIRMATION_TIMEOUT: 'needs_user',
  URL_NOT_ALLOWED: 'policy_blocked',
  PAGE_NOT_SUPPORTED: 'policy_blocked',
  CAPABILITY_DISABLED: 'policy_blocked',
  TAB_NOT_IN_SESSION: 'policy_blocked',
  INVALID_ARGUMENT: 'invalid_call',
};

/** Text clues for failures that arrive as a message without a usable code (a tool refusal, a covered control). */
const TEXT_CLUES: Array<[RegExp, Diagnosis]> = [
  [/\bcovered by\b|\boverlay\b|\bintercept/i, 'occluded_or_blocked'],
  [/\bno (?:element|tab|match)\b|not found|no tab of this window/i, 'element_not_found'],
  [/stale|no longer (?:in the page|what was shown)|new document/i, 'stale_reference'],
  [/timed? ?out|did not finish in time/i, 'timeout_flaky'],
];

export function diagnose(errorCode: string | undefined, message = ''): Diagnosis {
  if (errorCode && (CODE_TO_DIAGNOSIS as Record<string, Diagnosis>)[errorCode]) return (CODE_TO_DIAGNOSIS as Record<string, Diagnosis>)[errorCode]!;
  for (const [re, d] of TEXT_CLUES) if (re.test(message)) return d;
  return 'unknown';
}

const CHAINS: Record<Diagnosis, HealStep[]> = {
  stale_reference: ['resnapshot', 'refine_target', 'switch_method'],
  element_not_found: ['smart_wait', 'resnapshot', 'scroll_into_view', 'switch_method'],
  ambiguous_target: ['refine_target', 'resnapshot', 'switch_method'],
  occluded_or_blocked: ['dismiss_overlay', 'scroll_into_view', 'switch_method', 'smart_wait'],
  value_not_applied: ['reobserve_state', 'resnapshot', 'switch_method'],
  timeout_flaky: ['smart_wait', 'reobserve_state', 'switch_method'],
  navigation_problem: ['reobserve_state', 'smart_wait', 'switch_method'],
  needs_user: ['ask_or_stop'],
  policy_blocked: ['ask_or_stop'],
  invalid_call: ['refine_target'],
  unknown: ['reobserve_state', 'smart_wait', 'switch_method'],
};

export function chainFor(d: Diagnosis): HealStep[] {
  return CHAINS[d];
}

/** A terminal diagnosis ends the run: only a person can decide it. A policy refusal is not terminal (another route may exist); it is only never retried on the same target. */
export function isTerminal(d: Diagnosis): boolean {
  return d === 'needs_user';
}

const WORDS: Record<HealStep, string> = {
  resnapshot: 'take a fresh snapshot and use the refs it shows',
  smart_wait: 'wait for the page state to change (wait for text or an element), not a fixed delay',
  scroll_into_view: 'scroll the control into view',
  dismiss_overlay: 'close or move the covering dialog, banner or menu',
  refine_target: 'target the control by role and name, with nth or within when several match',
  switch_method: 'change method (a different tool, keyboard, the app command surface or a visual point)',
  reobserve_state: 'read the page state to see what actually changed before acting again',
  ask_or_stop: 'stop and report the exact blocker; do not retry',
};

export function directiveFor(d: Diagnosis): string {
  return `Diagnosis: ${d.replace(/_/g, ' ')}. Next: ${chainFor(d).map(s => WORDS[s]).join('; then ')}.`;
}
