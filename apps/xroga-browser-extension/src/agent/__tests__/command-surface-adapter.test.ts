import { describe, expect, it } from 'vitest';
import { runSurface } from '../command-surface';
import { scriptConsoleSurface, validateConsoleArgs, type ConsoleArgs } from '../command-surface-adapter';

const args: ConsoleArgs = { editorAt: [0.8, 0.4], text: 'print(3)', executeKey: 'Control+Enter', expectOutput: 'objects 3', editorText: 'Script' };

const changing = (after: string) => { let n = 0; return () => ({ ok: true, text: n++ === 0 ? 'Output: (empty)' : after }); };

function tools(map: Record<string, (i: Record<string, unknown>) => { ok: boolean; text: string }>, log: string[] = []) {
  return async (tool: string, input: Record<string, unknown>) => { log.push(`${tool}:${String(input.action ?? '')}`); return (map[tool] ?? (() => ({ ok: true, text: 'ok' })))(input); };
}

describe('script console adapter', () => {
  it('runs focus, replace, run, read and verify through the layer tools', async () => {
    const log: string[] = [];
    const surface = scriptConsoleSurface(args, tools({ read: changing('Output: objects 3') }, log));
    const res = await runSurface(surface, { text: args.text });
    expect(res.ok).toBe(true);
    expect(log).toEqual(['wait:', 'canvas:click', 'canvas:type', 'read:', 'canvas:key', 'read:']);
  });
  it('types with replace so the example text is not spliced', async () => {
    const seen: Record<string, unknown>[] = [];
    let reads = 0;
    const surface = scriptConsoleSurface(args, async (t, i) => { if (i.action === 'type') seen.push(i); return { ok: true, text: t === 'read' ? (reads++ === 0 ? 'empty' : 'objects 3') : 'ok' }; });
    await runSurface(surface, { text: args.text });
    expect(seen[0]?.replace).toBe(true);
  });
  it('stops as unknown when the editor text is not visible (wrong menu), and types nothing', async () => {
    const log: string[] = [];
    const surface = scriptConsoleSurface(args, tools({ wait: () => ({ ok: false, text: 'timeout' }) }, log));
    const res = await runSurface(surface, { text: args.text });
    expect(res.ok).toBe(false);
    expect(res.stoppedAt).toBe('targetEditor');
    expect(log).not.toContain('canvas:type');
  });
  it('fails verification when the Output does not match, and names the pattern', async () => {
    const surface = scriptConsoleSurface(args, tools({ read: changing('TypeError: x is not a function') }));
    const res = await runSurface(surface, { text: args.text });
    expect(res.ok).toBe(false);
    expect(res.stoppedAt).toBe('verify');
    expect(res.reason).toContain('objects 3');
  });
  it('exports only after a verified run', async () => {
    const log: string[] = [];
    const a = { ...args, exportSteps: [{ tool: 'canvas', args: { action: 'key', key: 'Control+e' } }] };
    const bad = scriptConsoleSurface(a, tools({ read: () => ({ ok: true, text: 'nope' }) }, log));
    await runSurface(bad, { text: a.text, exportResult: true });
    expect(log.filter(l => l === 'canvas:key')).toHaveLength(1);
  });
  it('rejects an Output left over from an earlier run (identical to the baseline) and accepts a changed one', async () => {
    const log: string[] = [];
    let reads = 0;
    const stale = scriptConsoleSurface(args, tools({ read: () => { reads++; return { ok: true, text: 'Output: objects 3' }; } }, log));
    const res = await runSurface(stale, { text: args.text });
    expect(res.ok).toBe(false);
    expect(res.stoppedAt).toBe('verify');
    expect(res.reason).toContain('left over');
    let n = 0;
    const fresh = scriptConsoleSurface(args, tools({ read: () => ({ ok: true, text: n++ === 0 ? 'Output: nothing yet' : 'Output: objects 3' }) }));
    expect((await runSurface(fresh, { text: args.text })).ok).toBe(true);
  });
  it('clears the Output first when asked, then needs no baseline comparison', async () => {
    const log: string[] = [];
    const a = { ...args, clearSteps: [{ tool: 'click', args: { target: { role: 'button', name: 'Clear' } } }] };
    const s = scriptConsoleSurface(a, tools({ read: () => ({ ok: true, text: 'Output: objects 3' }) }, log));
    const res = await runSurface(s, { text: a.text });
    expect(res.ok).toBe(true);
    expect(log.indexOf('click:')).toBeLessThan(log.indexOf('canvas:key'));
  });
  it('validates arguments', () => {
    expect(validateConsoleArgs(args)).toBeNull();
    expect(validateConsoleArgs({ ...args, editorAt: [2, 0.5] })).toContain('fractions');
    expect(validateConsoleArgs({ ...args, executeKey: undefined })).toContain('executeKey');
    expect(validateConsoleArgs({ ...args, expectOutput: '(' })).toContain('valid pattern');
    expect(validateConsoleArgs({ ...args, open: [{ tool: 'upload', args: {} }] })).toContain('not allowed');
  });
});
