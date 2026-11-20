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
  it('works from element targets with no coordinates: click the editor, clear, type with replace, click Run', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const a: ConsoleArgs = { editor: { ref: 'e12' }, run: { ref: 'e5' }, clear: { ref: 'e7' }, text: 'print(3)', expectOutput: 'objects 3' };
    expect(validateConsoleArgs(a)).toBeNull();
    const surface = scriptConsoleSurface(a, async (t, i) => { seen.push({ t, ...i }); return { ok: true, text: t === 'read' ? 'objects 3' : 'ok' }; });
    const res = await runSurface(surface, { text: a.text });
    expect(res.ok).toBe(true);
    expect(seen.filter(x => x.t === 'click').map(x => (x.target as { ref: string }).ref)).toEqual(['e12', 'e7', 'e5']);
    expect(seen.find(x => x.action === 'type')?.replace).toBe(true);
  });
  it('needs some way to find the editor and some way to run', () => {
    expect(validateConsoleArgs({ text: 'x', expectOutput: 'y', executeKey: 'Control+Enter' })).toContain('editor');
    expect(validateConsoleArgs({ text: 'x', expectOutput: 'y', editor: { ref: 'e1' } })).toContain('run');
  });
  it('matches an anchored pattern against the changed Output line, after its label, and shows the new lines when it does not match', async () => {
    let n = 0;
    const page = () => (n++ === 0 ? 'tab "Untitled-1"\ntext "Output: (nothing yet)"' : 'tab "Untitled-1"\ntext "Output: 3"');
    const ok = scriptConsoleSurface({ ...args, expectOutput: '^3$', editorText: undefined }, tools({ read: () => ({ ok: true, text: page() }) }));
    expect((await runSurface(ok, { text: args.text })).ok).toBe(true);
    let m = 0;
    const bad = scriptConsoleSurface({ ...args, expectOutput: '^4$', editorText: undefined }, tools({ read: () => ({ ok: true, text: m++ === 0 ? 'text "Output: -"' : 'text "Output: 3"' }) }));
    const res = await runSurface(bad, { text: args.text });
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('New lines');
    expect(res.reason).toContain('Output: 3');
  });
  it('opens the console from a list of menu names in one call', async () => {
    const seen: string[] = [];
    let reads = 0;
    const a: ConsoleArgs = { openPath: ['Tools', 'Scripts', 'Scripts Panel'], editor: { ref: 'e12' }, run: { ref: 'e5' }, text: 'print(3)', expectOutput: '3' };
    expect(validateConsoleArgs(a)).toBeNull();
    const surface = scriptConsoleSurface(a, async (t, i) => { if (t === 'click') seen.push(String((i.target as { name?: string; ref?: string }).name ?? (i.target as { ref?: string }).ref)); return { ok: true, text: t === 'read' ? (reads++ === 0 ? 'Output: -' : 'Output: 3') : 'ok' }; });
    expect((await runSurface(surface, { text: a.text })).ok).toBe(true);
    expect(seen.slice(0, 3)).toEqual(['Tools', 'Scripts', 'Scripts Panel']);
    expect(validateConsoleArgs({ ...a, openPath: new Array(7).fill('x') })).toContain('openPath');
  });
  it('validates arguments', () => {
    expect(validateConsoleArgs(args)).toBeNull();
    expect(validateConsoleArgs({ ...args, editorAt: [2, 0.5] })).toContain('fractions');
    expect(validateConsoleArgs({ ...args, executeKey: undefined })).toContain('executeKey');
    expect(validateConsoleArgs({ ...args, expectOutput: '(' })).toContain('valid pattern');
    expect(validateConsoleArgs({ ...args, open: [{ tool: 'upload', args: {} }] })).toContain('not allowed');
  });
});
