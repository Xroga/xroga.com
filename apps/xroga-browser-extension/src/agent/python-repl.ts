// `python_repl`: code as a way to act on data (the idea of browser-use's persistent REPL, MIT; written here). Extension pages cannot run model-written code (MV3), so
// each cell runs in Xroga's isolated server sandbox through the same route as run_repository: no network, no secrets, nothing kept. Variables carry over because the
// cells that ran successfully earlier in the run are replayed first with their output hidden, then the new cell runs and only its output is shown. Files a cell writes to
// xroga-out/ come back like run_repository's. A cell that fails is not kept, so a typo does not poison the session. Nothing here touches the browser or the user's accounts.
export const REPL_REPO = 'https://github.com/octocat/Hello-World';
const MAX_CELL = 100_000;
const MAX_HISTORY = 300_000;

export const PYTHON_REPL_TOOL = {
  name: 'python_repl',
  source: 'agent' as const,
  group: 'working' as const,
  description:
    'Run Python for data work on what you already hold (rows from extract_rows, text you read, numbers): parse, clean, dedupe, join, count, compute, build a CSV or report. Each call is one cell; variables, imports and functions from earlier successful cells are still there. Print what you need: only the new cell’s output comes back. Files written to xroga-out/ are returned. No internet, no secrets, no extra packages (standard library only), nothing kept after the run. Put the data in the code (paste it as a literal or JSON string). action reset starts clean.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['run', 'reset'] },
      code: { type: 'string', maxLength: MAX_CELL },
      timeoutSeconds: { type: 'integer', minimum: 5, maximum: 300 },
    },
    required: ['action'],
    additionalProperties: false,
  },
};

const RUNNER = `import contextlib, io, json
ns = {"__name__": "__main__"}
cells = json.load(open("cells.json"))
with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
    for i, c in enumerate(cells["prev"]):
        exec(compile(c, "<earlier cell %d>" % (i + 1), "exec"), ns)
exec(compile(cells["cell"], "<this cell>", "exec"), ns)
`;

const history = new Map<string, string[]>();

/** The files and arguments for one call: the earlier cells and the new one as JSON, and the runner that replays them. */
export function replRequest(prev: string[], cell: string, timeoutSeconds?: number) {
  return {
    url: REPL_REPO,
    command: 'python3' as const,
    args: ['run.py'],
    files: [
      { path: 'run.py', content: RUNNER },
      { path: 'cells.json', content: JSON.stringify({ prev, cell }) },
    ],
    ...(timeoutSeconds ? { timeoutSeconds } : {}),
  };
}

type Runner = (runId: string, input: unknown, signal: AbortSignal, wrap: (text: string, source: string) => string) => Promise<{ text: string; isError: boolean }>;

export async function runPythonRepl(
  runId: string,
  input: unknown,
  signal: AbortSignal,
  wrap: (text: string, source: string) => string,
  run: Runner,
): Promise<{ text: string; isError: boolean }> {
  const args = (input ?? {}) as { action?: string; code?: string; timeoutSeconds?: number };
  if (args.action === 'reset') {
    history.delete(runId);
    return { text: 'python_repl: the session is clean; earlier variables are gone.', isError: false };
  }
  const code = typeof args.code === 'string' ? args.code : '';
  if (!code.trim()) return { text: 'error: python_repl run needs code.', isError: true };
  if (code.length > MAX_CELL) return { text: `error: a cell is limited to ${MAX_CELL} characters; split it.`, isError: true };
  const prev = history.get(runId) ?? [];
  if (prev.reduce((n, c) => n + c.length, code.length) > MAX_HISTORY) {
    return { text: 'error: the session holds too much earlier code to replay. Call python_repl with action reset, then paste only the data and functions you still need.', isError: true };
  }
  const result = await run(runId, replRequest(prev, code, args.timeoutSeconds), signal, wrap);
  if (!result.isError) history.set(runId, [...prev, code]);
  return {
    text: result.isError ? `${result.text}\n(this cell was not kept: earlier variables are as they were)` : result.text,
    isError: result.isError,
  };
}

/** For tests and run end. */
export function clearRepl(runId?: string): void {
  if (runId) history.delete(runId);
  else history.clear();
}
