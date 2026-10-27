/**
 * Chooses and runs the project's own tests for a change, inside the isolated execution boundary only.
 *
 * What runs is derived from the project itself (package.json scripts, pytest or unittest, go.mod), never from the model, and only in
 * the package directories the change touched. Generated or repository code is never executed on the API host: the execution port is
 * the existing sandbox runtime, and when no runtime can isolate the work the result is `unavailable`, never a pass.
 *
 * The result is honest about what it is: `passed` only when every selected stage exited 0; `unsupported` when no native runner is
 * known for the touched code (the change is then reported as not test-verified); a timeout, a missing runtime and a cancellation are
 * their own statuses and never read as failures of the code or as successes.
 */
import { redactModelContext } from '../../ai/contextPreparation.js';
import { SandboxUnavailableError, type SandboxExecutionRequest, type SandboxExecutionResult } from '../../sandbox/sandboxTypes.js';
import { ExistingSourceError } from '../types.js';

export type ChangeRuntime = 'node' | 'python' | 'go';

export interface TestStage { readonly id: string; readonly label: string; readonly command: string; readonly args: readonly string[]; readonly cwd: string; readonly networkPolicy: 'none' | 'registry-only'; readonly timeoutMs: number; readonly kind: 'install' | 'test' }

export interface TestPlan {
  readonly status: 'planned' | 'unsupported';
  readonly runtime: ChangeRuntime | null;
  readonly roots: readonly string[];
  readonly stages: readonly TestStage[];
  readonly reason: string | null;
}

export interface ExecutionPort { execute(request: Omit<SandboxExecutionRequest, 'limits'> & { limits?: Partial<SandboxExecutionRequest['limits']> }): Promise<SandboxExecutionResult> }

export interface StageOutcome { readonly id: string; readonly label: string; readonly kind: 'install' | 'test'; readonly exitCode: number | null; readonly timedOut: boolean; readonly durationMs: number; readonly output: string }

export type TestRunStatus = 'passed' | 'failed' | 'unsupported' | 'unavailable' | 'timeout' | 'cancelled' | 'error';

export interface TestRunResult {
  readonly status: TestRunStatus;
  readonly plan: TestPlan;
  readonly stages: readonly StageOutcome[];
  readonly summary: string;
  /** Bounded, redacted failure evidence for a repair attempt. */
  readonly evidence: string;
  readonly durationMs: number;
}

const MAX_EVIDENCE = 6_000;
const manifestRoot = (path: string): string => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
const has = (files: ReadonlyMap<string, string>, p: string) => files.has(p);
const inDir = (root: string, name: string) => (root ? `${root}/${name}` : name);

/** The nearest directory at or above `path` that has a manifest of the given names. */
function nearestRoot(files: ReadonlyMap<string, string>, path: string, names: readonly string[]): string | null {
  let dir = manifestRoot(path);
  for (;;) {
    if (names.some((n) => has(files, inDir(dir, n)))) return dir;
    if (dir === '') return null;
    dir = manifestRoot(dir);
  }
}

function nodeStages(files: ReadonlyMap<string, string>, root: string): TestStage[] | null {
  let pkg: { scripts?: Record<string, string>; dependencies?: object; devDependencies?: object };
  try { pkg = JSON.parse(files.get(inDir(root, 'package.json')) ?? ''); } catch { return null; }
  const test = pkg.scripts?.test;
  if (!test || /no test specified/i.test(test)) return null;
  const stages: TestStage[] = [];
  const hasDeps = Object.keys(pkg.dependencies ?? {}).length + Object.keys(pkg.devDependencies ?? {}).length > 0;
  if (hasDeps) {
    const locked = has(files, inDir(root, 'package-lock.json'));
    stages.push({ id: `install:${root || '.'}`, label: `install dependencies${root ? ` (${root})` : ''}`, command: 'npm', args: locked ? ['ci', '--ignore-scripts', '--no-audit', '--no-fund'] : ['install', '--ignore-scripts', '--no-audit', '--no-fund'], cwd: root, networkPolicy: 'registry-only', timeoutMs: 240_000, kind: 'install' });
  }
  stages.push({ id: `test:${root || '.'}`, label: `npm test${root ? ` (${root})` : ''}`, command: 'npm', args: ['test', '--silent'], cwd: root, networkPolicy: 'none', timeoutMs: 240_000, kind: 'test' });
  return stages;
}

function pythonStages(files: ReadonlyMap<string, string>, root: string): TestStage[] {
  const req = ['requirements.txt', 'requirements-dev.txt'].filter((n) => has(files, inDir(root, n)));
  const text = [...req, 'pyproject.toml', 'setup.cfg', 'pytest.ini', 'tox.ini'].map((n) => files.get(inDir(root, n)) ?? '').join('\n');
  const usesPytest = /pytest/i.test(text) || has(files, inDir(root, 'pytest.ini')) || has(files, inDir(root, 'conftest.py'));
  const stages: TestStage[] = [];
  for (const n of req) stages.push({ id: `install:${root || '.'}:${n}`, label: `pip install -r ${n}`, command: 'python', args: ['-m', 'pip', 'install', '--disable-pip-version-check', '-q', '-r', n], cwd: root, networkPolicy: 'registry-only', timeoutMs: 240_000, kind: 'install' });
  stages.push(usesPytest
    ? { id: `test:${root || '.'}`, label: `pytest${root ? ` (${root})` : ''}`, command: 'python', args: ['-m', 'pytest', '-q', '-x', '--no-header', '-p', 'no:cacheprovider'], cwd: root, networkPolicy: 'none', timeoutMs: 240_000, kind: 'test' }
    : { id: `test:${root || '.'}`, label: `unittest${root ? ` (${root})` : ''}`, command: 'python', args: ['-m', 'unittest', 'discover', '-v'], cwd: root, networkPolicy: 'none', timeoutMs: 240_000, kind: 'test' });
  return stages;
}

function goStages(root: string): TestStage[] {
  return [
    { id: `install:${root || '.'}`, label: `go mod download${root ? ` (${root})` : ''}`, command: 'go', args: ['mod', 'download'], cwd: root, networkPolicy: 'registry-only', timeoutMs: 240_000, kind: 'install' },
    { id: `test:${root || '.'}`, label: `go test${root ? ` (${root})` : ''}`, command: 'go', args: ['test', './...'], cwd: root, networkPolicy: 'none', timeoutMs: 240_000, kind: 'test' },
  ];
}

/** The tests to run for a set of changed paths over the project's files; every decision comes from the project's own manifests. */
export function planTests(allFiles: readonly { path: string; content: string }[], changedPaths: readonly string[], maxRoots = 3): TestPlan {
  const files = new Map(allFiles.map((f) => [f.path, f.content]));
  const stages: TestStage[] = []; const roots: string[] = []; const unsupported: string[] = []; let runtime: ChangeRuntime | null = null;
  for (const path of changedPaths) {
    const kind = /\.(?:[cm]?[jt]sx?)$/.test(path) || /(^|\/)package\.json$/.test(path) ? 'node' : /\.py$/.test(path) ? 'python' : /\.go$/.test(path) || /(^|\/)go\.mod$/.test(path) ? 'go' : null;
    if (!kind) continue;
    const root = nearestRoot(files, path, kind === 'node' ? ['package.json'] : kind === 'python' ? ['pyproject.toml', 'setup.cfg', 'setup.py', 'pytest.ini', 'requirements.txt', 'tox.ini'] : ['go.mod']);
    if (root === null) { unsupported.push(`${path}: no ${kind} project manifest found`); continue; }
    const key = `${kind}:${root}`;
    if (roots.includes(key)) continue;
    const planned = kind === 'node' ? nodeStages(files, root) : kind === 'python' ? pythonStages(files, root) : goStages(root);
    if (!planned) { unsupported.push(`${path}: ${root || 'the project'} defines no test script`); continue; }
    if (roots.length >= maxRoots) { unsupported.push(`${path}: more than ${maxRoots} packages changed; run the rest separately`); continue; }
    roots.push(key); stages.push(...planned); runtime = runtime ?? kind;
  }
  if (!stages.length) return { status: 'unsupported', runtime: null, roots: [], stages: [], reason: unsupported[0] ?? 'No native test runner is known for the changed files.' };
  return { status: 'planned', runtime, roots, stages, reason: unsupported.length ? `Not covered: ${unsupported.join('; ')}` : null };
}

const SAFE_ENV: Record<string, string> = { CI: 'true', HOME: '/tmp/xroga-home', NO_COLOR: '1', npm_config_update_notifier: 'false', PIP_NO_INPUT: '1', PYTHONDONTWRITEBYTECODE: '1', GOFLAGS: '-mod=mod' };

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, Math.floor(n * 0.35))}\n... output shortened ...\n${s.slice(-Math.floor(n * 0.6))}`);
const outputOf = (r: SandboxExecutionResult) => redactModelContext(`${r.stdout}${r.stderr ? `\n${r.stderr}` : ''}`).value;

export interface RunTestsInput {
  readonly port: ExecutionPort;
  readonly files: readonly { path: string; content: string }[];
  readonly changedPaths: readonly string[];
  readonly signal?: AbortSignal;
  /** Overrides the project-derived plan (used to run only a regression test before the fix). */
  readonly plan?: TestPlan;
  readonly environment?: Record<string, string>;
}

/** Runs the plan in the isolated runtime. Install stages may reach the package registry; test stages never have a network. */
export async function runTests(input: RunTestsInput): Promise<TestRunResult> {
  const plan = input.plan ?? planTests(input.files, input.changedPaths);
  const started = Date.now();
  if (plan.status === 'unsupported') return { status: 'unsupported', plan, stages: [], summary: `No native test runner for this change: ${plan.reason}`, evidence: '', durationMs: 0 };
  if (input.signal?.aborted) return { status: 'cancelled', plan, stages: [], summary: 'Cancelled before the tests ran.', evidence: '', durationMs: 0 };
  const stages: StageOutcome[] = [];
  const total = plan.stages.reduce((n, s) => n + s.timeoutMs, 0);
  try {
    const result = await input.port.execute({
      files: input.files.map((f) => ({ path: f.path, content: f.content })), command: plan.stages[0]!.command, args: [...plan.stages[0]!.args], timeoutMs: total,
      networkPolicy: plan.stages.some((s) => s.networkPolicy === 'registry-only') ? 'registry-only' : 'none', environment: { ...SAFE_ENV, ...(input.environment ?? {}) },
      stages: plan.stages.map((s) => ({ id: s.id, command: s.command, args: [...s.args], networkPolicy: s.networkPolicy, timeoutMs: s.timeoutMs, ...(s.cwd ? { cwd: s.cwd } : {}) })),
      signal: input.signal,
    });
    const byId = new Map((result.stages ?? []).map((s) => [s.id, s]));
    for (const s of plan.stages) {
      const r = byId.get(s.id);
      if (!r) break; // an earlier stage failed or the deadline passed; later stages did not run
      stages.push({ id: s.id, label: s.label, kind: s.kind, exitCode: r.exitCode, timedOut: r.timedOut, durationMs: r.durationMs, output: clip(outputOf(r), MAX_EVIDENCE) });
    }
    if (stages.length === 0) stages.push({ id: plan.stages[0]!.id, label: plan.stages[0]!.label, kind: plan.stages[0]!.kind, exitCode: result.exitCode, timedOut: result.timedOut, durationMs: result.durationMs, output: clip(outputOf(result), MAX_EVIDENCE) });
  } catch (error) {
    if (input.signal?.aborted) return { status: 'cancelled', plan, stages, summary: 'Cancelled while the tests were running.', evidence: '', durationMs: Date.now() - started };
    if (error instanceof SandboxUnavailableError || (error instanceof ExistingSourceError && error.code === 'EXECUTION_UNAVAILABLE')) {
      return { status: 'unavailable', plan, stages, summary: 'No isolated runtime is available, so the tests were not run. This is not a pass.', evidence: '', durationMs: Date.now() - started };
    }
    return { status: 'error', plan, stages, summary: 'The isolated test run could not be completed.', evidence: '', durationMs: Date.now() - started };
  }
  const failed = stages.find((s) => s.timedOut || (s.exitCode !== 0));
  const durationMs = Date.now() - started;
  if (!failed) {
    const ranTests = stages.filter((s) => s.kind === 'test').length;
    if (ranTests < plan.stages.filter((s) => s.kind === 'test').length) return { status: 'error', plan, stages, summary: 'Not every selected test stage reported a result, so this is not a pass.', evidence: '', durationMs };
    return { status: 'passed', plan, stages, summary: `${ranTests} test run${ranTests === 1 ? '' : 's'} passed (${plan.stages.filter((s) => s.kind === 'test').map((s) => s.label).join(', ')}).`, evidence: '', durationMs };
  }
  const evidence = clip(`${failed.label} ${failed.timedOut ? 'timed out' : `exited ${failed.exitCode}`}\n${failed.output}`, MAX_EVIDENCE);
  if (failed.timedOut) return { status: 'timeout', plan, stages, summary: `${failed.label} timed out.`, evidence, durationMs };
  // an install failure is an environment problem, reported as such, not as a failing test
  return { status: failed.kind === 'install' ? 'error' : 'failed', plan, stages, summary: failed.kind === 'install' ? `${failed.label} failed, so the tests could not run.` : `${failed.label} failed.`, evidence, durationMs };
}
