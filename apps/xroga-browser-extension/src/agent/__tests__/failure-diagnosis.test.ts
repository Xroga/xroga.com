import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@src/browser-control/protocol/errors';
import { chainFor, diagnose, directiveFor, isTerminal } from '../failure-diagnosis';
import { ProgressTracker } from '../progress-tracker';

describe('diagnose (adapted from browser-agent healing.ts)', () => {
  it('classifies the layer error codes', () => {
    expect(diagnose('STALE_DOCUMENT')).toBe('stale_reference');
    expect(diagnose('NO_MATCH')).toBe('element_not_found');
    expect(diagnose('AMBIGUOUS_TARGET')).toBe('ambiguous_target');
    expect(diagnose('OBSCURED')).toBe('occluded_or_blocked');
    expect(diagnose('STATE_UNCHANGED')).toBe('value_not_applied');
    expect(diagnose('TIMEOUT')).toBe('timeout_flaky');
    expect(diagnose('USER_DECLINED')).toBe('needs_user');
    expect(diagnose('URL_NOT_ALLOWED')).toBe('policy_blocked');
  });
  it('knows every protocol error code or falls back safely', () => {
    for (const code of ERROR_CODES) {
      const d = diagnose(code);
      expect(chainFor(d).length).toBeGreaterThan(0);
    }
  });
  it('reads a covered-control message without a code', () => {
    expect(diagnose(undefined, 'textbox «Name» is covered by dialog «Cookie notice» at its click point')).toBe('occluded_or_blocked');
    expect(diagnose(undefined, 'something odd')).toBe('unknown');
  });
  it('only a decision for a person is terminal', () => {
    expect(isTerminal('needs_user')).toBe(true);
    expect(isTerminal('policy_blocked')).toBe(false);
    expect(isTerminal('occluded_or_blocked')).toBe(false);
  });
  it('writes a short directive with the ordered chain', () => {
    const d = directiveFor('occluded_or_blocked');
    expect(d).toContain('close or move the covering');
    expect(d.indexOf('close or move')).toBeLessThan(d.indexOf('change method'));
  });
});

describe('ProgressTracker with diagnosis', () => {
  const fail = (code: string, n = 1) => ({ tool: 'click', isError: true, errorCode: code, resultText: `err ${n}`, tabId: 1 });
  it('stops at once when only a person can decide, without waiting for repeats', () => {
    const t = new ProgressTracker();
    const v = t.record(fail('USER_DECLINED'));
    expect(v.exhausted).toBe(true);
    expect(v.diagnosis).toBe('needs_user');
    expect(v.directive).toContain('exact blocker');
  });
  it('keeps going after a policy refusal and adds the diagnosis when the method stalls', () => {
    const t = new ProgressTracker();
    expect(t.record(fail('URL_NOT_ALLOWED', 1)).stalled).toBe(false);
    t.record(fail('URL_NOT_ALLOWED', 2));
    const v = t.record(fail('URL_NOT_ALLOWED', 3));
    expect(v.stalled && v.switched).toBe(true);
    expect(v.diagnosis).toBe('policy_blocked');
  });
  it('attaches the covering-overlay advice to a stalled click', () => {
    const t = new ProgressTracker();
    t.record(fail('OBSCURED', 1)); t.record(fail('OBSCURED', 2));
    expect(t.record(fail('OBSCURED', 3)).directive).toContain('covering dialog');
  });
});
