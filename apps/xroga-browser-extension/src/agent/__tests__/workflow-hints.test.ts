import { describe, expect, it } from 'vitest';
import { distill, hintSection, pick, recordStale, remember, sanitizeLabel, type RunFacts } from '../workflow-hints';

const NOW = 1_800_000_000_000;
const facts = (over: Partial<RunFacts> = {}): RunFacts => ({
  owner: 'owner-a',
  url: 'https://app.example.com/invoices?id=991234',
  request: 'Mark invoice paid in the billing table',
  steps: [
    { tool: 'click', label: 'Billing', ok: true },
    { tool: 'click', label: 'Mark paid', ok: true },
    { tool: 'done', ok: true },
  ],
  verified: true,
  now: NOW,
  ...over,
});

describe('workflow hints', () => {
  it('learns only from verified runs', () => {
    expect(distill(facts({ verified: false }))).toBeNull();
    expect(distill(facts())).not.toBeNull();
  });

  it('never stores typed values, emails, long tokens, numbers or URLs', () => {
    const hint = distill(
      facts({
        steps: [
          { tool: 'type', label: 'Email field', ok: true },
          { tool: 'click', label: 'Send to bob@corp.com sk_live_ABCDEFGHIJKLMNOPQRSTUV 12345678 https://x.test/a?t=1', ok: true },
          { tool: 'plugin_act', label: 'Sheet 1', ok: true },
        ],
      }),
    )!;
    const text = JSON.stringify(hint);
    expect(text).not.toMatch(/bob@corp|sk_live|12345678|https?:/);
    expect(hint.steps[0]).toEqual({ tool: 'type' });
    expect(hint.steps[2]).toEqual({ tool: 'plugin_act' });
  });

  it('a hint is never shown to another owner (cross-tenant isolation)', () => {
    const list = remember([], distill(facts())!);
    const ask = { url: 'https://app.example.com/', request: 'mark the invoice paid in billing', now: NOW };
    expect(pick(list, { ...ask, owner: 'owner-a' })).toHaveLength(1);
    expect(pick(list, { ...ask, owner: 'owner-b' })).toHaveLength(0);
    expect(pick(list, { ...ask, owner: '' })).toHaveLength(0);
  });

  it('is limited to the same site and a similar task', () => {
    const list = remember([], distill(facts())!);
    const base = { owner: 'owner-a', now: NOW };
    expect(pick(list, { ...base, url: 'https://evil.example.org/', request: 'mark invoice paid billing' })).toHaveLength(0);
    expect(pick(list, { ...base, url: 'https://app.example.com/', request: 'translate a poem into french' })).toHaveLength(0);
  });

  it('a stale layout retires the hint after two failures', () => {
    let list = remember([], distill(facts())!);
    const id = list[0].id;
    list = recordStale(list, 'owner-a', id);
    expect(list).toHaveLength(1);
    list = recordStale(list, 'owner-a', id);
    expect(list).toHaveLength(0);
    // another owner's failure does not touch this owner's hint
    const other = recordStale(remember([], distill(facts())!), 'owner-b', id);
    expect(other[0].failures).toBe(0);
  });

  it('expires after 30 days and changed input still finds the same task', () => {
    const list = remember([], distill(facts())!);
    const ask = { owner: 'owner-a', url: 'https://app.example.com/x', request: 'Please mark the invoice paid in billing' };
    expect(pick(list, { ...ask, now: NOW + 31 * 24 * 3600 * 1000 })).toHaveLength(0);
    expect(pick(list, { ...ask, now: NOW + 3600 * 1000 })).toHaveLength(1);
  });

  it('an interrupted run (not verified, failed steps) teaches nothing', () => {
    expect(distill(facts({ verified: false, steps: [{ tool: 'click', label: 'Billing', ok: true }] }))).toBeNull();
    expect(distill(facts({ steps: [{ tool: 'click', label: 'Billing', ok: false }, { tool: 'done', ok: true }] }))).toBeNull();
  });

  it('the prompt text is guidance and grants no authority', () => {
    const text = hintSection([distill(facts())!]);
    expect(text).toContain('guidance only');
    expect(text).toMatch(/approval it normally needs now/);
    expect(hintSection([])).toBe('');
  });

  it('sanitizeLabel is bounded', () => {
    expect(sanitizeLabel('x'.repeat(200)).length).toBeLessThanOrEqual(40);
  });
});
