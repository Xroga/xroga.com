import { describe, expect, it } from 'vitest';
import { ActionLedger, SiteActionRegistry, actionHash, describeAction, fillTemplate, runSiteAction, validateAction, validateInput, type VerifiedSiteAction } from '../site-actions';
import { SAMPLE_ACTIONS } from '../site-actions-sample';

const URL_OK = 'http://127.0.0.1:8787/stale-and-slow.html?mode=stale';
const open = SAMPLE_ACTIONS.find(a => a.id === 'orders.open')!;
const list = SAMPLE_ACTIONS.find(a => a.id === 'orders.list')!;
const del = SAMPLE_ACTIONS.find(a => a.id === 'orders.delete')!;

function page(over: Partial<Record<string, { ok: boolean; text: string }>> = {}) {
  const log: Array<{ tool: string; args: Record<string, unknown> }> = [];
  const call = async (tool: string, args: Record<string, unknown>) => { log.push({ tool, args }); return over[tool] ?? { ok: true, text: `${tool} ok` }; };
  return { call, log };
}

describe('the contract', () => {
  it('has a stable hash that changes when anything about the action changes', async () => {
    const h = await actionHash(open);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(await actionHash({ ...open })).toBe(h);
    expect(await actionHash({ ...open, version: '2' })).not.toBe(h);
    expect(await actionHash({ ...open, steps: [{ tool: 'click', args: { target: { role: 'button', name: 'Delete {{input.order}}' } } }] })).not.toBe(h);
  });
  it('refuses actions with code-evaluating or origin-leaving steps, or no reviewer', () => {
    expect(validateAction({ ...open, steps: [{ tool: 'evaluate', args: { code: 'document.cookie' } }] })).toContain('not allowed');
    expect(validateAction({ ...open, steps: [{ tool: 'navigate', args: { url: 'https://evil.test' } }] })).toContain('not allowed');
    expect(validateAction({ ...open, source: { ...open.source, reviewedBy: '' } })).toContain('reviewer');
    expect(validateAction({ ...open, postcondition: '' })).toContain('postcondition');
    expect(validateAction({ ...open, rule: { host: '*.com' } })).toContain('rule');
    expect(validateAction(open)).toBeNull();
  });
  it('validates input against the schema and fills only declared inputs', () => {
    expect(validateInput(open.inputSchema, { order: 'Order 1002' })).toBeNull();
    expect(validateInput(open.inputSchema, {})).toContain('required');
    expect(validateInput(open.inputSchema, { order: 'Order 9' })).toContain('one of');
    expect(validateInput(open.inputSchema, { order: 'Order 1001', extra: 1 })).toContain('not an input');
    expect(fillTemplate('Open {{input.order}} {{input.nope}}', { order: 'A' })).toBe('Open A ');
    // A value that looks like a template is not expanded again.
    expect(fillTemplate('{{input.a}}', { a: '{{input.b}}', b: 'SECRET' })).toBe('{{input.b}}');
  });
});

describe('runSiteAction', () => {
  it('runs a verified low-risk write: version check, steps, postcondition, done', async () => {
    const hash = await actionHash(open);
    const p = page();
    const r = await runSiteAction(open, hash, { order: 'Order 1002' }, { call: p.call, url: URL_OK, ledger: new ActionLedger() });
    expect(r.status).toBe('done');
    expect(p.log.map(l => l.tool)).toEqual(['wait', 'click', 'wait']);
    expect((p.log[1]!.args.target as { name: string }).name).toBe('Open Order 1002');
    expect(r.receipts).toHaveLength(1);
  });
  it('reads without any write step and returns the page text', async () => {
    const r = await runSiteAction(list, await actionHash(list), {}, { call: page({ read: { ok: true, text: 'Order 1001\nOrder 1002' } }).call, url: URL_OK, ledger: new ActionLedger() });
    expect(r.status).toBe('done');
    expect(r.output).toContain('Order 1002');
  });
  it('refuses a changed definition, a look-alike page, an invalid input', async () => {
    const hash = await actionHash(open);
    const deps = (url: string) => ({ call: page().call, url, ledger: new ActionLedger() });
    expect((await runSiteAction({ ...open, version: '9' }, hash, { order: 'Order 1001' }, deps(URL_OK))).status).toBe('refused');
    expect((await runSiteAction(open, hash, { order: 'Order 1001' }, deps('http://127.0.0.1.evil.test/stale-and-slow.html'))).status).toBe('refused');
    expect((await runSiteAction(open, hash, { order: 'Order 1001' }, deps('http://127.0.0.1:8787/other.html'))).status).toBe('refused');
    expect((await runSiteAction(open, hash, { order: 'nope' }, deps(URL_OK))).status).toBe('invalid_input');
  });
  it('never runs a consequential action, whatever the model says, and does not touch the page', async () => {
    const p = page();
    const r = await runSiteAction(del, await actionHash(del), { order: 'Order 1001' }, { call: p.call, url: URL_OK, ledger: new ActionLedger() });
    expect(r.status).toBe('needs_approval');
    expect(p.log).toEqual([]);
  });
  it('stops with version_mismatch, before any step, when the reviewed marker is not on the page', async () => {
    const p = page({ wait: { ok: false, text: 'TIMEOUT' } });
    const r = await runSiteAction(open, await actionHash(open), { order: 'Order 1001' }, { call: p.call, url: URL_OK, ledger: new ActionLedger() });
    expect(r.status).toBe('version_mismatch');
    expect(p.log.map(l => l.tool)).toEqual(['wait']);
  });
  it('reports a failed step and an unmet postcondition honestly', async () => {
    const hash = await actionHash(open);
    const failedStep = await runSiteAction(open, hash, { order: 'Order 1001' }, { call: page({ click: { ok: false, text: 'covered by dialog' } }).call, url: URL_OK, ledger: new ActionLedger() });
    expect(failedStep.status).toBe('step_failed');
    let waits = 0;
    const unverified = await runSiteAction(open, hash, { order: 'Order 1001' }, { call: async tool => (tool === 'wait' && ++waits === 2 ? { ok: false, text: 'TIMEOUT' } : { ok: true, text: 'ok' }), url: URL_OK, ledger: new ActionLedger() });
    expect(unverified.status).toBe('unverified');
    expect(unverified.message).toContain('NOT confirmed');
  });
  it('never repeats a write in a run, but allows a different one, and does not record a failed one', async () => {
    const hash = await actionHash(open);
    const ledger = new ActionLedger();
    const deps = (c = page().call) => ({ call: c, url: URL_OK, ledger });
    expect((await runSiteAction(open, hash, { order: 'Order 1001' }, deps())).status).toBe('done');
    expect((await runSiteAction(open, hash, { order: 'Order 1001' }, deps())).status).toBe('duplicate');
    expect((await runSiteAction(open, hash, { order: 'Order 1003' }, deps())).status).toBe('done');
    const l2 = new ActionLedger();
    await runSiteAction(open, hash, { order: 'Order 1002' }, { call: page({ click: { ok: false, text: 'x' } }).call, url: URL_OK, ledger: l2 });
    expect((await runSiteAction(open, hash, { order: 'Order 1002' }, { call: page().call, url: URL_OK, ledger: l2 })).status).toBe('done');
  });
});

describe('SiteActionRegistry', () => {
  it('lists only the actions whose rule matches the page', async () => {
    const reg = new SiteActionRegistry();
    for (const a of SAMPLE_ACTIONS) await reg.register(a);
    expect(reg.forUrl(URL_OK).map(a => a.id).sort()).toEqual(['orders.delete', 'orders.list', 'orders.open']);
    expect(reg.forUrl('https://example.org/')).toEqual([]);
    expect(reg.forUrl('http://127.0.0.1.evil.test/stale-and-slow.html')).toEqual([]);
    expect(describeAction(open)).toContain('write_low');
  });
  it('refuses to register an invalid action', async () => {
    const bad = { ...open, steps: [{ tool: 'evaluate', args: {} }] } as VerifiedSiteAction;
    await expect(new SiteActionRegistry().register(bad)).rejects.toThrow('not allowed');
  });
});
