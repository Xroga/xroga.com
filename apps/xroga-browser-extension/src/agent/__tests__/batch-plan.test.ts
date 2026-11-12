import { describe, expect, it } from 'vitest';
import { BatchError, MAX_OPS, MAX_REPEAT, isCondition, runPlan, worstCase, type Condition, type Step } from '../batch-plan';

/** A page that is a set of facts: text on it, and a "Next" button that stays until it has been clicked `pages` times. */
function page(pages = 3) {
  const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
  let clicks = 0;
  const banner = { open: true };
  const test = async (c: Condition): Promise<boolean> => {
    if (c.for === 'text') return c.value === 'Cookie banner' ? banner.open : c.value === 'Next' ? clicks < pages : false;
    if (c.for === 'text_gone') return !(await test({ for: 'text', value: c.value }));
    if (c.for === 'visible') return c.name === 'Next' ? clicks < pages : false;
    if (c.for === 'hidden') return !(await test({ for: 'visible', role: c.role, name: c.name }));
    return false;
  };
  const run = async (tool: string, args: Record<string, unknown>) => {
    calls.push({ tool, args });
    if (tool === 'click' && (args.target as { name?: string } | undefined)?.name === 'Next') clicks++;
    if (tool === 'click' && (args.target as { name?: string } | undefined)?.name === 'Accept') banner.open = false;
    return { text: `${tool} ok` };
  };
  return { calls, test, run, state: () => ({ clicks, banner: banner.open }) };
}
const click = (name: string): Step => ({ tool: 'click', args: { target: { role: 'button', name } } });

describe('the conditions', () => {
  it('accepts the five kinds and refuses anything else', () => {
    expect(isCondition({ for: 'text', value: 'Next' })).toBe(true);
    expect(isCondition({ for: 'visible', role: 'button', name: 'Next' })).toBe(true);
    expect(isCondition({ for: 'hidden', role: 'dialog' })).toBe(true);
    for (const bad of [null, {}, { for: 'text' }, { for: 'eval', value: 'document.title' }, { for: 'visible' }, { for: 'url', value: '' }]) expect(isCondition(bad)).toBe(false);
  });
});

describe('a batch', () => {
  it('runs the steps in order as one unit, with defaults under each step and the last result shown', async () => {
    const p = page();
    const r = await runPlan([{ tool: 'navigate', args: { url: 'https://a.example' } }, click('Go'), { tool: 'read' }], { run: p.run, test: p.test, defaults: { tabId: 7 } });
    expect(p.calls.map(c => c.tool)).toEqual(['navigate', 'click', 'read']);
    expect(p.calls.every(c => c.args.tabId === 7)).toBe(true);
    expect(r.text).toContain('✓ navigate → ✓ click → ✓ read');
    expect(r.ran).toBe(3);
    expect(r.ok).toBe(true);
  });

  it('skips a step whose when is false and runs one whose when is true, and says why in the trail', async () => {
    const p = page();
    const r = await runPlan([{ ...click('Accept'), when: { for: 'text', value: 'Cookie banner' } }, { ...click('Accept'), when: { for: 'text', value: 'Cookie banner' } }], { run: p.run, test: p.test });
    expect(p.calls).toHaveLength(1);
    expect(r.text).toContain('skipped: text "Cookie banner" was false');
  });

  it('unless runs a step only when the condition does not hold', async () => {
    const p = page();
    const r = await runPlan([{ ...click('Retry'), unless: { for: 'visible', role: 'button', name: 'Next' } }, { ...click('Retry'), unless: { for: 'hidden', role: 'button', name: 'Next' } }], { run: p.run, test: p.test });
    expect(p.calls.map(c => c.tool)).toEqual(['click']);
    expect(r.text).toContain('skipped: visible');
  });

  it('repeats until a condition holds, at least once (click Next until it is gone)', async () => {
    const p = page(3);
    const r = await runPlan([{ ...click('Next'), repeat: { until: { for: 'text_gone', value: 'Next' } } }], { run: p.run, test: p.test });
    expect(p.state().clicks).toBe(3);
    expect(r.text).toContain('✓ click ×3');
  });

  it('a while that is already false runs zero times; a count runs exactly that many', async () => {
    const p = page(0);
    await runPlan([{ ...click('Next'), repeat: { while: { for: 'visible', role: 'button', name: 'Next' } } }], { run: p.run, test: p.test });
    expect(p.calls).toHaveLength(0);
    const q = page(9);
    await runPlan([{ ...click('Next'), repeat: 4 }], { run: q.run, test: q.test });
    expect(q.state().clicks).toBe(4);
  });

  it('runs a group as one unit under the step conditions', async () => {
    const p = page(2);
    await runPlan([{ steps: [click('Next'), { tool: 'read' }], repeat: { until: { for: 'text_gone', value: 'Next' } } }], { run: p.run, test: p.test });
    expect(p.calls.map(c => c.tool)).toEqual(['click', 'read', 'click', 'read']);
  });

  it('stops at the first failure and returns the trail, or carries on when told to', async () => {
    const failing = async (tool: string) => (tool === 'bad' ? { text: 'error NOT_FOUND\nno such element', ok: false } : { text: `${tool} ok` });
    const steps: Step[] = [{ tool: 'a' }, { tool: 'bad' }, { tool: 'c' }];
    await expect(runPlan(steps, { run: failing, test: async () => true })).rejects.toThrow(BatchError);
    await expect(runPlan(steps, { run: failing, test: async () => true })).rejects.toThrow(/✓ a → ✗ bad: error NOT_FOUND/);
    const r = await runPlan(steps, { run: failing, test: async () => true, stopOnError: false });
    expect(r.ok).toBe(false);
    expect(r.ran).toBe(3);
  });

  it('refuses a repeat that never ends rather than pinning the browser', async () => {
    const p = page(99);
    await expect(runPlan([{ ...click('Next'), repeat: { until: { for: 'text_gone', value: 'Next' }, max: 5 } }], { run: p.run, test: p.test })).rejects.toThrow(/repeat hit max 5/);
    expect(p.calls).toHaveLength(5);
    // max is clamped, and a plan that could exceed the ceiling is refused before it starts.
    expect(worstCase([{ ...click('x'), repeat: 1000 }])).toBe(MAX_REPEAT);
    await expect(runPlan(Array.from({ length: 5 }, () => ({ ...click('x'), repeat: MAX_REPEAT })), { run: p.run, test: p.test })).rejects.toThrow(`more than ${MAX_OPS}`);
  });

  it('refuses malformed steps and tools that may not run in a batch', async () => {
    const p = page();
    const ok = { run: p.run, test: p.test, forbidden: new Set(['batch', 'start_parallel_tasks']) };
    await expect(runPlan([], ok)).rejects.toThrow('at least one step');
    await expect(runPlan([{}], ok)).rejects.toThrow('needs a tool');
    await expect(runPlan([{ tool: 'a', steps: [{ tool: 'b' }] }], ok)).rejects.toThrow('both tool and steps');
    await expect(runPlan([{ tool: 'batch' }], ok)).rejects.toThrow('cannot run inside a batch');
    await expect(runPlan([{ tool: 'start_parallel_tasks' }], ok)).rejects.toThrow('cannot run inside a batch');
    await expect(runPlan([{ tool: 'a', when: { for: 'eval', value: 'x' } as never }], ok)).rejects.toThrow('needs a condition');
    await expect(runPlan([{ tool: 'a', repeat: {} }], ok)).rejects.toThrow('repeat needs');
    await expect(runPlan([{ steps: [{ steps: [{ steps: [{ steps: [{ tool: 'a' }] }] }] }] }], ok)).rejects.toThrow('nest at most');
    expect(p.calls).toHaveLength(0);
  });
});
