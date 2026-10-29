/**
 * The SoftwareAgent tool host for an EXISTING project: the one seam through which the Xroga agent (Cline) reads and changes a linked
 * repository or ZIP import. Everything it does goes through the isolated ChangeWorkspace (exact base commit, write policy, credential
 * refusal, change limits) and the isolated execution port; nothing reaches the source, the GitHub account or the API host.
 *
 * Commands are not a shell: the line is split into a program and arguments, anything with shell syntax is refused, and only the
 * project's own build/test tooling is allowed. Reads are redacted before the model sees them.
 */
import type { CommandExecutionResult, FileMutationResult, FileRenameResult, FileWriteIntent, GitDiffResult, ProjectFileContent, ProjectFileSummary, ReviewBranchResult, SoftwareAgentToolHost } from '../../ai/softwareAgent/toolHost.js';
import type { SoftwareCheckResult, SoftwareExecutionContract, SoftwarePreviewEvidence } from '../../ai/softwareAgent/contracts.js';
import { redactModelContext } from '../../ai/contextPreparation.js';
import { isSensitivePath } from '../sensitivePaths.js';
import { ExistingSourceError } from '../types.js';
import { planTests, runTests, type ExecutionPort } from './testRunner.js';
import type { ChangeWorkspace } from './workspace.js';
import { WorkspaceRefusal } from './workspace.js';

/** Observes the running change in a browser inside the isolated runtime. Receives whether the project's own build and tests passed. */
export type PreviewVerifier = (files: readonly { path: string; content: string }[], context: { buildPassed: boolean; testsPassed: boolean | null }) => Promise<SoftwarePreviewEvidence>;

export interface HostOptions {
  readonly workspace: ChangeWorkspace;
  readonly execution: ExecutionPort;
  readonly signal?: AbortSignal;
  readonly previewVerifier?: PreviewVerifier;
  /** Present only when review-branch delivery was authorised for this change. */
  readonly createReviewBranch?: (contract: SoftwareExecutionContract) => Promise<ReviewBranchResult>;
  readonly onCheck?: (checks: SoftwareCheckResult[]) => void;
  /** A refused action, as one line without any content: it becomes a denied receipt in the change's durable events. */
  readonly onDenied?: (what: string) => void;
}

const SHELL_SYNTAX = /[;&|<>$`\\(){}*?~!#"'\n\r]/;
const SCRIPT = /^[A-Za-z0-9:_-]{1,40}$/;
const SAFE_ARG = /^[A-Za-z0-9_./:=@+-]{1,200}$/;

/** `null` when the command is allowed, otherwise why not. */
export function checkCommand(line: string): { program: string; args: string[]; network: 'none' | 'registry-only' } | string {
  const text = String(line ?? '').trim();
  if (!text || text.length > 300) return 'Give one short command.';
  if (SHELL_SYNTAX.test(text)) return 'Shell syntax is not available; give a single command with plain arguments.';
  const [program, ...args] = text.split(/\s+/);
  if (args.some((a) => !SAFE_ARG.test(a) || a.includes('..') || a.startsWith('/'))) return 'That argument is not allowed.';
  const first = args[0];
  switch (program) {
    case 'npm':
      if (first === 'test' || first === 't') return { program, args, network: 'none' };
      if (first === 'run' && args[1] && SCRIPT.test(args[1]) && !['publish', 'deploy', 'release', 'postinstall'].includes(args[1])) return { program, args, network: 'none' };
      if ((first === 'ci' || first === 'install' || first === 'i') && args.slice(1).every((a) => a.startsWith('--') && !a.startsWith('--registry') && a !== '--global')) return { program, args: [...args, ...(args.includes('--ignore-scripts') ? [] : ['--ignore-scripts'])], network: 'registry-only' };
      return 'Only npm test, npm run <script>, npm ci and npm install (without packages) are available.';
    case 'node':
      return first && !first.startsWith('-') ? { program, args, network: 'none' } : first === '--test' ? { program, args, network: 'none' } : 'Run node with a project script or --test.';
    case 'python': case 'python3':
      if (first === '-m' && ['pytest', 'unittest', 'compileall'].includes(args[1] ?? '')) return { program: 'python', args, network: 'none' };
      if (first === '-m' && args[1] === 'pip' && args[2] === 'install' && args.slice(3).every((a, i, arr) => a === '-r' || (arr[i - 1] === '-r') || a === '-q')) return { program: 'python', args, network: 'registry-only' };
      return first && !first.startsWith('-') ? { program: 'python', args, network: 'none' } : 'Run python -m pytest, -m unittest or a project script.';
    case 'pytest': return { program: 'python', args: ['-m', 'pytest', ...args], network: 'none' };
    case 'go':
      return ['test', 'vet', 'build'].includes(first ?? '') ? { program, args, network: 'none' } : first === 'mod' && args[1] === 'download' && args.length === 2 ? { program, args, network: 'registry-only' } : 'Only go test, vet, build and mod download are available.';
    case 'tsc': case 'eslint': case 'jest': case 'vitest': return { program: 'npx', args: ['--no-install', program, ...args], network: 'none' };
    default: return `The command "${String(program).slice(0, 30)}" is not available.`;
  }
}

export class ExistingSourceToolHost implements SoftwareAgentToolHost {
  constructor(private readonly options: HostOptions) {}
  private lastChecks: SoftwareCheckResult[] = [];
  private get ws() { return this.options.workspace; }
  private deny(what: string): void { try { this.options.onDenied?.(what.slice(0, 200)); } catch { /* a receipt failure must not change the refusal */ } }
  private guarded<T>(action: string, path: string, fn: () => T): T {
    try { return fn(); } catch (error) { if (error instanceof WorkspaceRefusal) this.deny(`Refused to ${action} ${path.slice(0, 120)}: ${error.reason}`); throw error; }
  }
  private abortCheck(): void { if (this.options.signal?.aborted) throw new ExistingSourceError('CHANGE_CONFLICT', 'The change was cancelled.'); }

  async listFiles(): Promise<ProjectFileSummary[]> { return this.ws.workspace.listFiles().filter((f) => !isSensitivePath(f.path)); }

  async readFiles(_contract: SoftwareExecutionContract, paths: string[]): Promise<ProjectFileContent[]> {
    this.abortCheck();
    return paths.slice(0, 40).map((p) => {
      if (isSensitivePath(p)) { this.deny(`Refused to read ${p.slice(0, 120)}: credentials`); throw new WorkspaceRefusal('Credential files are never read.', 'sensitive'); }
      let file;
      try { file = this.ws.workspace.readFile(p); } catch (error) { this.deny(`Refused to read ${p.slice(0, 120)}: not in the working copy`); throw error; }
      return { path: file.path, content: redactModelContext(file.content).value };
    });
  }

  async searchProject(_contract: SoftwareExecutionContract, query: string) {
    return this.ws.workspace.search(query, 50).filter((r) => !isSensitivePath(r.path)).map((r) => ({ ...r, preview: r.preview ? redactModelContext(r.preview).value : r.preview }));
  }

  async writeFile(_contract: SoftwareExecutionContract, path: string, content: string, intent: FileWriteIntent): Promise<FileMutationResult> {
    this.abortCheck();
    this.guarded('write', path, () => this.ws.guardWrite(path, intent === 'create' ? 'create' : 'modify', content));
    return this.ws.workspace.writeFile(path, content, intent);
  }

  async deleteFile(_contract: SoftwareExecutionContract, path: string) {
    this.abortCheck();
    this.guarded('delete', path, () => this.ws.guardWrite(path, 'delete'));
    return this.ws.workspace.deleteFile(path);
  }

  async renameFile(_contract: SoftwareExecutionContract, fromPath: string, toPath: string): Promise<FileRenameResult> {
    this.abortCheck();
    this.guarded('rename', fromPath, () => this.ws.guardWrite(fromPath, 'rename')); this.guarded('rename', toPath, () => this.ws.guardWrite(toPath, 'rename'));
    return this.ws.workspace.renameFile(fromPath, toPath);
  }

  async runCommand(_contract: SoftwareExecutionContract, command: string): Promise<CommandExecutionResult> {
    this.abortCheck();
    const checked = checkCommand(command);
    if (typeof checked === 'string') this.deny(`Refused a command: ${checked}`);
    if (typeof checked === 'string') return { commandId: 'refused', command, exitCode: 126, stdout: '', stderr: checked, durationMs: 0 };
    const started = Date.now();
    try {
      const r = await this.options.execution.execute({
        files: this.ws.files(), command: checked.program, args: checked.args, timeoutMs: 240_000, networkPolicy: checked.network,
        environment: { CI: 'true', NO_COLOR: '1', HOME: '/tmp/xroga-home', PIP_NO_INPUT: '1' }, signal: this.options.signal,
      });
      const out = redactModelContext(`${r.stdout}${r.stderr ? `\n${r.stderr}` : ''}`).value;
      return { commandId: `cmd-${started}`, command, exitCode: r.timedOut ? 124 : r.exitCode ?? 1, stdout: out.slice(-6_000), stderr: '', durationMs: Date.now() - started };
    } catch (error) {
      const unavailable = error instanceof ExistingSourceError && error.code === 'EXECUTION_UNAVAILABLE' || (error as { code?: string }).code === 'SANDBOX_UNAVAILABLE';
      return { commandId: 'unavailable', command, exitCode: 125, stdout: '', stderr: unavailable ? 'No isolated runtime is available, so the command was not run.' : 'The command could not be run.', durationMs: Date.now() - started };
    }
  }

  async runChecks(): Promise<SoftwareCheckResult[]> {
    this.abortCheck();
    const changed = this.ws.changes().filter((c) => c.kind !== 'deleted').map((c) => c.path);
    const result = await runTests({ port: this.options.execution, files: this.ws.files(), changedPaths: changed, signal: this.options.signal });
    const checks: SoftwareCheckResult[] = result.status === 'unsupported' || result.stages.length === 0
      ? [{ id: 'tests', name: 'Project tests', status: 'skipped', summary: result.summary }]
      : result.stages.map((s) => ({ id: s.id, name: s.label, status: s.timedOut || s.exitCode !== 0 ? 'failed' as const : 'passed' as const, exitCode: s.exitCode ?? undefined, durationMs: s.durationMs, summary: s.exitCode === 0 && !s.timedOut ? 'passed' : result.evidence.slice(0, 1_500) }));
    this.options.onCheck?.(checks);
    this.lastChecks = checks;
    return checks;
  }

  async gitDiff(): Promise<GitDiffResult> {
    const set = this.ws.changeSet();
    return { changedPaths: set.files.map((f) => f.path), diff: set.diff, additions: set.additions, deletions: set.deletions };
  }

  async verifyPreview(): Promise<SoftwarePreviewEvidence> {
    if (this.options.previewVerifier) {
      const tests = this.lastChecks.filter((c) => /test/i.test(c.id));
      const build = this.lastChecks.filter((c) => !/test/i.test(c.id) && c.status !== 'skipped');
      return this.options.previewVerifier(this.ws.files(), {
        buildPassed: build.every((c) => c.status === 'passed'),
        testsPassed: tests.length === 0 || tests.every((c) => c.status === 'skipped') ? null : tests.every((c) => c.status === 'passed'),
      });
    }
    return { status: 'not_checked', attempted: false, url: null, notCheckedReason: 'sandbox_unavailable', blocker: 'No browser verifier is connected to this change.', criteriaNotChecked: [], screenshots: [] };
  }

  async createReviewBranch(contract: SoftwareExecutionContract): Promise<ReviewBranchResult> {
    if (!this.options.createReviewBranch) throw new ExistingSourceError('DELIVERY_REFUSED', 'Review-branch delivery is not authorised for this change.');
    return this.options.createReviewBranch(contract);
  }
}

export { planTests };
