/**
 * Bounded child processes whose whole tree dies on cancel, timeout or lease loss (INFRA-006).
 *
 * Chromium is a tree: browser, GPU, renderer and utility processes, plus anything a page managed to spawn. Killing only the top pid
 * leaves the rest holding memory, profile files and sockets, and a leaked renderer from tenant A's job is still running when tenant B's
 * job starts on the same host. `runBounded` therefore starts the child in its own process group (POSIX) or tracks it with taskkill /T
 * (Windows), and does not report the job finished until the tree is verifiably gone.
 */
import { spawn, spawnSync, type SpawnOptions } from 'node:child_process';

export interface BoundedResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  cancelled: boolean;
  /** true when the child's own pid is gone after the kill (descendants are covered by the group / taskkill /T kill) */
  treeGone: boolean;
}

export interface BoundedOptions {
  timeoutMs: number;
  signal?: AbortSignal;
  cwd?: string;
  /** the child's whole environment: nothing is inherited, so a worker secret cannot leak into the browser */
  env: NodeJS.ProcessEnv;
  stdio?: SpawnOptions['stdio'];
  /** called with each stdout chunk (diagnostics only) */
  onStdout?: (chunk: Buffer) => void;
}

const isWindows = process.platform === 'win32';

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Kills a process and all its descendants. Safe to call twice and on a pid that is already gone. */
export function killTree(pid: number): void {
  if (!Number.isInteger(pid) || pid <= 1) return;
  if (isWindows) {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    return;
  }
  try { process.kill(-pid, 'SIGKILL'); } catch { /* group already gone */ }
  try { process.kill(pid, 'SIGKILL'); } catch { /* process already gone */ }
}

/** Waits (bounded) until the child's own pid has exited; descendants are covered by the process-group / taskkill /T kill. */
async function waitGone(pid: number, withinMs: number): Promise<boolean> {
  const stop = Date.now() + withinMs;
  while (Date.now() < stop) {
    if (!isAlive(pid)) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return !isAlive(pid);
}

export async function runBounded(command: string, args: readonly string[], options: BoundedOptions): Promise<BoundedResult> {
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1) throw new Error('timeoutMs must be a positive integer');
  const child = spawn(command, [...args], {
    cwd: options.cwd,
    env: options.env, // never inherited
    stdio: options.stdio ?? ['ignore', 'pipe', 'ignore'],
    detached: !isWindows, // own process group, so killTree can address the whole tree
    windowsHide: true,
  });
  const pid = child.pid;
  if (options.onStdout) child.stdout?.on('data', options.onStdout);
  else child.stdout?.resume();

  let timedOut = false;
  let cancelled = false;
  const kill = () => { if (pid !== undefined) killTree(pid); };
  const timer = setTimeout(() => { timedOut = true; kill(); }, options.timeoutMs);
  const onAbort = () => { cancelled = true; kill(); };
  if (options.signal?.aborted) onAbort();
  else options.signal?.addEventListener('abort', onAbort, { once: true });

  const exited = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.once('error', () => resolve({ code: null, signal: null }));
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  clearTimeout(timer);
  options.signal?.removeEventListener('abort', onAbort);
  // a normal exit can still leave orphans (a browser that forks and detaches): always sweep the group
  kill();
  const treeGone = pid === undefined ? true : await waitGone(pid, 2_000);
  return { exitCode: exited.code, signal: exited.signal, timedOut, cancelled, treeGone };
}
