/**
 * A change to a PUBLIC GitHub repository at a pinned commit, verified in the isolated worker.
 *
 * This is the existing change workflow's pieces, assembled for a repository the caller has no connection to: the working copy is the exact
 * commit (fetched on demand into memory, nothing kept), edits go through the same ChangeWorkspace write policy, the project's own tests are
 * chosen by `planTests` from its manifests and run by `runTests` through the execution port (the offline worker), and the diff is the
 * workspace's authoritative change set. The edits come from the caller (the coding agent, through its normal model route); nothing here selects
 * or changes a model. Tests run on the untouched commit first, so a repository whose tests already fail is reported as such rather than blamed
 * on the edit.
 */
import { gitBlobSha } from '../archive/archivePort.js';
import { isSensitivePath } from '../sensitivePaths.js';
import { fetchRepositoryFiles, parseRepositoryUrl, RepoRunError } from '../../sandbox/repoRun.js';
import { ChangeWorkspace, type BaseSnapshot, type ChangePolicy } from './workspace.js';
import { planTests, runTests, type ExecutionPort, type TestRunResult } from './testRunner.js';

export interface FileEdit {
  readonly path: string;
  /** Exact text to replace; it must occur exactly once. Omit it to create a new file whose content is `replace`. */
  readonly find?: string;
  readonly replace: string;
}

export interface PublicRepoChangeInput {
  readonly url: string;
  readonly ref?: string;
  readonly edits: readonly FileEdit[];
  readonly port: ExecutionPort;
  readonly signal?: AbortSignal;
  /** Test seam: replaces the network retrieval. */
  readonly fetchFiles?: typeof fetchRepositoryFiles;
}

export interface PublicRepoChangeResult {
  readonly repository: string;
  readonly commit: string;
  readonly diff: string;
  readonly files: readonly { path: string; kind: string; additions: number; deletions: number }[];
  readonly baseline: TestRunResult;
  readonly after: TestRunResult;
  /** verified: the tests passed on the untouched commit and on the edited copy. Anything else says why not. */
  readonly verdict: 'verified' | 'unverified' | 'failed';
  readonly verdictReason: string;
}

const POLICY: ChangePolicy = {
  write: { allowedPaths: [], deniedPaths: ['.github/workflows/**', '.git/**', '.gitmodules'], allowCreate: true, allowDelete: false, allowRename: false },
  maxChangedFiles: 10, maxChangedBytes: 256 * 1024,
};

export async function runPublicRepoChange(input: PublicRepoChangeInput): Promise<PublicRepoChangeResult> {
  const { owner, repo } = parseRepositoryUrl(input.url);
  const ref = (input.ref ?? 'HEAD').trim();
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(ref) || ref.includes('..')) throw new RepoRunError('REPO_REF_INVALID', 'The version must be a branch, tag or commit name without slashes.');
  if (!input.edits.length) throw new RepoRunError('CHANGE_EMPTY', 'There is no edit to apply.');
  const fetched = await (input.fetchFiles ?? fetchRepositoryFiles)(owner, repo, ref);
  // a pinned commit is checked, not trusted: the archive must report exactly the commit that was asked for
  if (/^[0-9a-f]{40}$/.test(ref) && fetched.commit !== ref) throw new RepoRunError('REPO_VERSION_MISMATCH', 'The archive is not the pinned commit.');
  const files = fetched.files.filter((f) => !isSensitivePath(f.path)).map((f) => ({ path: f.path, content: f.content, blobSha: gitBlobSha(f.content) }));
  const snapshot: BaseSnapshot = { commitSha: fetched.commit, files, omitted: [], complete: fetched.omitted === 0, incompleteReason: fetched.omitted ? 'some files were not text or too large' : null };
  const workspace = new ChangeWorkspace(snapshot, POLICY);

  const plan = planTests(files, input.edits.map((e) => e.path));
  // the untouched commit's tests start now and run while the edits are applied and the edited copy is tested (two isolated containers), so a change
  // costs one run's time, not two; an edit that is refused below leaves this run to finish unobserved
  const baselineRun = runTests({ port: input.port, files, changedPaths: input.edits.map((e) => e.path), plan, signal: input.signal });
  baselineRun.catch(() => undefined);

  for (const edit of input.edits) {
    if (edit.find === undefined) {
      workspace.guardWrite(edit.path, 'create', edit.replace);
      workspace.workspace.writeFile(edit.path, edit.replace, 'create');
      continue;
    }
    if (!workspace.workspace.hasFile(edit.path)) throw new RepoRunError('CHANGE_REFUSED', `${edit.path} is not in the repository.`);
    const current = workspace.workspace.readFile(edit.path).content;
    const first = current.indexOf(edit.find);
    if (first < 0 || current.indexOf(edit.find, first + 1) >= 0) throw new RepoRunError('CHANGE_REFUSED', `The text to replace must occur exactly once in ${edit.path}.`);
    const next = current.slice(0, first) + edit.replace + current.slice(first + edit.find.length);
    workspace.guardWrite(edit.path, 'modify', next);
    workspace.workspace.writeFile(edit.path, next, 'modify');
  }
  const set = workspace.changeSet();
  const editedFiles = workspace.files();
  const editedPaths = set.files.map((f) => f.path);
  // an edit can add or change a manifest (a new requirements file), so the edited copy is planned from its own files, not the base's
  const [baseline, after] = await Promise.all([baselineRun, runTests({ port: input.port, files: editedFiles, changedPaths: editedPaths, plan: planTests(editedFiles, editedPaths), signal: input.signal })]);

  let verdict: PublicRepoChangeResult['verdict'] = 'unverified';
  let verdictReason = after.summary;
  if (after.status === 'passed' && baseline.status === 'passed') { verdict = 'verified'; verdictReason = `The repository's own tests passed on the pinned commit and on the edited copy. ${after.summary}`; }
  else if (after.status === 'passed') verdictReason = `The edited copy passed, but the untouched commit's tests were not confirmed passing (${baseline.status}).`;
  else if (after.status === 'failed') {
    verdict = baseline.status === 'passed' ? 'failed' : 'unverified';
    verdictReason = baseline.status === 'passed' ? `The tests passed before the edit and fail after it: ${after.summary}` : `The tests fail after the edit, but the untouched commit's tests did not pass either (${baseline.status}).`;
  }
  return {
    repository: `${owner}/${repo}`, commit: fetched.commit, diff: set.diff, files: set.files.map((f) => ({ path: f.path, kind: f.kind, additions: f.additions, deletions: f.deletions })),
    baseline, after, verdict, verdictReason,
  };
}
