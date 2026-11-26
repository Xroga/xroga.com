import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearRepl, replRequest, runPythonRepl } from '../python-repl';

const wrap = (t: string) => t;
const signal = new AbortController().signal;
type Sent = { files: Array<{ content: string }> };
const okRun = () => vi.fn(async (_id: string, _input: unknown, _s: AbortSignal, _w: (t: string, s: string) => string) => ({ text: 'ok', isError: false }));
const prevOf = (run: ReturnType<typeof okRun>, n: number) => JSON.parse((run.mock.calls[n]![1] as Sent).files[1]!.content).prev;

beforeEach(() => clearRepl());

describe('replRequest', () => {
  it('sends the runner and the earlier cells with the new one as JSON', () => {
    const r = replRequest(['a = 1'], 'print(a)', 30);
    expect(r.command).toBe('python3');
    expect(r.args).toEqual(['run.py']);
    expect(r.timeoutSeconds).toBe(30);
    expect(JSON.parse(r.files[1]!.content)).toEqual({ prev: ['a = 1'], cell: 'print(a)' });
    expect(r.files[0]!.content).toContain('redirect_stdout');
  });
});

describe('runPythonRepl', () => {
  it('keeps a cell that succeeded and replays it next time', async () => {
    const run = okRun();
    await runPythonRepl('r1', { action: 'run', code: 'x = 2' }, signal, wrap, run);
    await runPythonRepl('r1', { action: 'run', code: 'print(x)' }, signal, wrap, run);
    expect(prevOf(run, 1)).toEqual(['x = 2']);
  });

  it('drops a failed cell so it is not replayed', async () => {
    const run = okRun();
    run.mockResolvedValueOnce({ text: 'Traceback', isError: true });
    const failed = await runPythonRepl('r2', { action: 'run', code: 'oops(' }, signal, wrap, run);
    expect(failed.isError).toBe(true);
    expect(failed.text).toContain('not kept');
    await runPythonRepl('r2', { action: 'run', code: 'print(1)' }, signal, wrap, run);
    expect(prevOf(run, 1)).toEqual([]);
  });

  it('reset clears the session and sessions are separate per run', async () => {
    const run = okRun();
    await runPythonRepl('a', { action: 'run', code: 'v = 1' }, signal, wrap, run);
    await runPythonRepl('b', { action: 'run', code: 'print(1)' }, signal, wrap, run);
    expect(prevOf(run, 1)).toEqual([]);
    expect((await runPythonRepl('a', { action: 'reset' }, signal, wrap, run)).text).toContain('clean');
    await runPythonRepl('a', { action: 'run', code: 'print(2)' }, signal, wrap, run);
    expect(prevOf(run, 2)).toEqual([]);
  });

  it('refuses empty code and an oversized replay without calling the sandbox', async () => {
    const run = okRun();
    expect((await runPythonRepl('c', { action: 'run', code: '  ' }, signal, wrap, run)).isError).toBe(true);
    for (let i = 0; i < 4; i++) await runPythonRepl('c', { action: 'run', code: `# ${'x'.repeat(99_000)}` }, signal, wrap, run);
    const calls = run.mock.calls.length;
    const big = await runPythonRepl('c', { action: 'run', code: `# ${'y'.repeat(99_000)}` }, signal, wrap, run);
    expect(big.text).toContain('reset');
    expect(run.mock.calls.length).toBe(calls);
  });
});
