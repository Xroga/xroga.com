import { createHash } from 'node:crypto';

import type { ProjectFile } from '../../ai/patches.js';
import { buildSourceArchive, EXPORT_MANIFEST_PATH, readZip } from '../export/archive.js';
import type { Phase2Store } from '../phase2Store.js';
import type { BuilderService } from '../service.js';
import { BuilderError, type BuilderProject, type BuilderRevision, type ExternalOperation } from '../types.js';
import { GitHubPortError, validBranchName, validRepositoryName, type GitHubOwner, type GitHubPort, type GitHubRepo, type GitHubViewer } from './port.js';

/**
 * Customer-owned GitHub export.
 *
 * Every external change goes prepare, approve, execute:
 *  - prepare records the EXACT plan (owner, repository, visibility, branch, revision) and its digest
 *    before any provider call, so a retry has an identity;
 *  - approve is an explicit user action that must quote that digest, expires, and is never inferred
 *    from model text;
 *  - execute re-verifies the account, the owner and the revision, claims the single in-flight slot
 *    with a database compare-and-set, performs the change, then verifies what GitHub really holds
 *    before recording a receipt.
 * The owner must be one the connected account can actually act for, as reported by GitHub itself.
 */

export const APPROVAL_TTL_MS = 15 * 60 * 1000;
export const MAX_REPOSITORY_DESCRIPTION = 200;

export interface GitHubDeps {
  readonly phase2: Phase2Store;
  readonly builder: BuilderService;
  readonly github: GitHubPort;
  /** The user's connected GitHub token from the existing vault, or null when none is connected or it was revoked. */
  readonly tokenFor: (userId: string) => Promise<string | null>;
  readonly now?: () => Date;
}

export interface GitHubPlan extends Record<string, unknown> {
  readonly provider: 'github';
  readonly action: 'create_repository' | 'push_revision';
  readonly viewer: { readonly id: number; readonly login: string };
  readonly owner: GitHubOwner;
  readonly repository: { readonly name: string; readonly visibility: 'private' | 'public'; readonly branch: string; readonly id?: number };
  readonly revision: { readonly id: string; readonly number: number; readonly contentSha256: string; readonly fileCount: number };
  readonly marker: string;
  readonly expectedRemoteHead?: string | null;
  readonly warnings: readonly string[];
  readonly costNote: string;
}

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
};
export const planDigest = (plan: unknown): string => createHash('sha256').update(stable(plan)).digest('hex');
const markerFor = (projectId: string, operationKey: string) => `xroga-export:${createHash('sha256').update(`${projectId}:${operationKey}`).digest('hex').slice(0, 12)}`;

const COST_NOTE = 'Creating a repository is performed in your GitHub account and billed (if at all) by GitHub under that account or organization. Xroga cannot see your GitHub plan, so it cannot promise this is free.';

export interface GitHubTargets {
  readonly connected: boolean;
  readonly viewer: { readonly id: number; readonly login: string } | null;
  readonly owners: readonly GitHubOwner[];
  readonly canCreatePrivate: boolean | null;
  readonly notes: readonly string[];
}

export interface GitHubBinding {
  readonly repository: { readonly id: number; readonly owner: string; readonly ownerId: number; readonly name: string; readonly url: string; readonly private: boolean; readonly branch: string };
  readonly lastCommitSha: string;
  readonly lastRevisionNumber: number;
  readonly commits: ReadonlyArray<{ readonly revisionNumber: number; readonly revisionId: string; readonly commitSha: string; readonly operationId: string }>;
}

export class GitHubExportService {
  constructor(private readonly deps: GitHubDeps) {}

  private now(): Date {
    return (this.deps.now ?? (() => new Date()))();
  }

  private async connection(userId: string): Promise<{ token: string; viewer: GitHubViewer } | null> {
    const token = await this.deps.tokenFor(userId);
    if (!token) return null;
    try {
      return { token, viewer: await this.deps.github.viewer(token) };
    } catch (error) {
      if (error instanceof GitHubPortError && error.code === 'unauthorized') return null;
      throw error;
    }
  }

  async targets(userId: string): Promise<GitHubTargets> {
    const connection = await this.connection(userId);
    if (!connection) return { connected: false, viewer: null, owners: [], canCreatePrivate: null, notes: ['GitHub is not connected, or the connection was revoked. Connect GitHub in Xroga to export to your own repository.'] };
    const owners = await this.deps.github.listOwners(connection.token, connection.viewer);
    const notes: string[] = [];
    let canCreatePrivate: boolean | null = null;
    if (connection.viewer.scopesKnown) {
      canCreatePrivate = connection.viewer.scopes.includes('repo');
      if (!canCreatePrivate) notes.push('Your GitHub connection does not include the "repo" permission, so private repositories cannot be created. Reconnect GitHub and approve it.');
      if (!connection.viewer.scopes.includes('read:org') && !connection.viewer.scopes.includes('repo')) notes.push('Organizations may be missing from this list without the "read:org" permission.');
    } else {
      notes.push('GitHub did not report this connection\'s permissions, so they will be checked when the repository is created.');
    }
    return { connected: true, viewer: { id: connection.viewer.id, login: connection.viewer.login }, owners, canCreatePrivate, notes };
  }

  private async projectAndRevision(userId: string, projectId: string, revisionId?: string): Promise<{ project: BuilderProject; revision: BuilderRevision }> {
    const project = await this.deps.builder.requireProject(userId, projectId);
    const revision = revisionId ? await this.deps.builder.revisionFiles(userId, projectId, revisionId) : (await this.deps.builder.headFiles(userId, project)).revision;
    if (!revision) throw new BuilderError('not_found', 'The project has no source revision to export.');
    return { project, revision };
  }

  /** The files that go to GitHub: exactly the verified export, minus the Xroga manifest. */
  filesFor(project: BuilderProject, revision: BuilderRevision): ProjectFile[] {
    const archive = buildSourceArchive({ projectId: project.id, title: project.title, revision, starter: project.starter });
    const files = readZip(archive.buffer).filter((entry) => entry.path !== EXPORT_MANIFEST_PATH).map((entry) => ({ path: entry.path, content: entry.data.toString('utf8') }));
    if (!files.some((file) => file.path === '.gitignore') && files.some((file) => file.path === 'package.json')) {
      files.push({ path: '.gitignore', content: 'node_modules/\n.next/\ndist/\nbuild/\n.env\n.env.*\n!.env.example\n*.log\n.DS_Store\n' });
    }
    return files.sort((a, b) => (a.path < b.path ? -1 : 1));
  }

  async prepareCreate(userId: string, projectId: string, input: { operationKey: string; owner: string; repositoryName: string; visibility?: 'private' | 'public'; branch?: string; revisionId?: string }) {
    const visibility = input.visibility ?? 'private';
    const branch = input.branch ?? 'main';
    if (!validRepositoryName(input.repositoryName)) throw new BuilderError('invalid_input', 'That repository name is not valid for GitHub.');
    if (!validBranchName(branch)) throw new BuilderError('invalid_input', 'That branch name is not valid.');
    if (visibility !== 'private' && visibility !== 'public') throw new BuilderError('invalid_input', 'Visibility must be private or public.');
    const { project, revision } = await this.projectAndRevision(userId, projectId, input.revisionId);
    const files = this.filesFor(project, revision); // also proves the source is exportable and secret-free
    const connection = await this.connection(userId);
    if (!connection) throw new BuilderError('conflict', 'GitHub is not connected. Connect your GitHub account first.');
    // The owner must be an account the connected user can act for, as GitHub reports it, not as the client claims.
    const owners = await this.deps.github.listOwners(connection.token, connection.viewer);
    const owner = owners.find((candidate) => candidate.login.toLowerCase() === input.owner.toLowerCase());
    if (!owner) throw new BuilderError('invalid_input', `You are not connected to a GitHub account or organization named "${input.owner}".`);
    if (visibility === 'private' && connection.viewer.scopesKnown && !connection.viewer.scopes.includes('repo')) {
      throw new BuilderError('conflict', 'Your GitHub connection lacks the "repo" permission required for a private repository. Reconnect GitHub and approve it.');
    }
    const warnings: string[] = [];
    if (visibility === 'public') warnings.push('The repository will be PUBLIC: anyone on the internet can read this source.');
    const plan: GitHubPlan = {
      provider: 'github', action: 'create_repository', viewer: { id: connection.viewer.id, login: connection.viewer.login }, owner,
      repository: { name: input.repositoryName, visibility, branch },
      revision: { id: revision.id, number: revision.revisionNumber, contentSha256: revision.contentSha256, fileCount: files.length },
      marker: markerFor(projectId, input.operationKey), warnings, costNote: COST_NOTE,
    };
    const created = await this.deps.phase2.createOperation(userId, projectId, { provider: 'github', action: 'create_repository', operationKey: input.operationKey, revisionId: revision.id, plan, planDigest: planDigest(plan) });
    if (!created) throw new BuilderError('not_found', 'Project not found.');
    return { operation: created.operation, plan: created.operation.plan as GitHubPlan, created: created.created, requiresApproval: created.operation.status === 'prepared' };
  }

  async prepareSync(userId: string, projectId: string, input: { operationKey: string; revisionId?: string }) {
    const binding = await this.binding(userId, projectId);
    if (!binding) throw new BuilderError('conflict', 'This project has no GitHub repository yet. Create one first.');
    const { project, revision } = await this.projectAndRevision(userId, projectId, input.revisionId);
    if (binding.commits.some((commit) => commit.revisionId === revision.id)) throw new BuilderError('conflict', 'This revision is already in your GitHub repository.');
    const files = this.filesFor(project, revision);
    const connection = await this.connection(userId);
    if (!connection) throw new BuilderError('conflict', 'GitHub is not connected. Reconnect it to sync.');
    const plan: GitHubPlan = {
      provider: 'github', action: 'push_revision', viewer: { id: connection.viewer.id, login: connection.viewer.login },
      owner: { login: binding.repository.owner, id: binding.repository.ownerId, type: connection.viewer.login.toLowerCase() === binding.repository.owner.toLowerCase() ? 'User' : 'Organization' },
      repository: { name: binding.repository.name, visibility: binding.repository.private ? 'private' : 'public', branch: binding.repository.branch, id: binding.repository.id },
      revision: { id: revision.id, number: revision.revisionNumber, contentSha256: revision.contentSha256, fileCount: files.length },
      marker: markerFor(projectId, input.operationKey), expectedRemoteHead: binding.lastCommitSha,
      warnings: ['This adds one new commit. Anything changed in the repository since the last sync will stop the push; nothing is ever overwritten.'], costNote: COST_NOTE,
    };
    const created = await this.deps.phase2.createOperation(userId, projectId, { provider: 'github', action: 'push_revision', operationKey: input.operationKey, revisionId: revision.id, plan, planDigest: planDigest(plan) });
    if (!created) throw new BuilderError('not_found', 'Project not found.');
    return { operation: created.operation, plan: created.operation.plan as GitHubPlan, created: created.created, requiresApproval: created.operation.status === 'prepared' };
  }

  /** The user's explicit approval. Must quote the digest of the plan they were shown. */
  async approve(userId: string, projectId: string, operationId: string, input: { digest: string }): Promise<ExternalOperation> {
    const operation = await this.requireOperation(userId, projectId, operationId);
    if (input.digest !== operation.planDigest || planDigest(operation.plan) !== operation.planDigest) throw new BuilderError('conflict', 'The approval does not match the plan that was prepared. Review the plan and approve it again.');
    const expires = new Date(this.now().getTime() + APPROVAL_TTL_MS).toISOString();
    const moved = await this.deps.phase2.transitionOperation(userId, projectId, operationId, ['prepared', 'failed', 'ambiguous'], 'approved', { approvedAt: this.now().toISOString(), approvalExpiresAt: expires, failure: null });
    if (!moved) {
      const current = await this.requireOperation(userId, projectId, operationId);
      if (current.status === 'approved') return current;
      throw new BuilderError('conflict', `This operation is ${current.status} and cannot be approved.`);
    }
    return moved;
  }

  async cancel(userId: string, projectId: string, operationId: string): Promise<ExternalOperation> {
    const moved = await this.deps.phase2.transitionOperation(userId, projectId, operationId, ['prepared', 'approved', 'failed', 'ambiguous'], 'cancelled', { failure: 'Cancelled by the user.' });
    if (!moved) throw new BuilderError('conflict', 'This operation can no longer be cancelled.');
    return moved;
  }

  private async requireOperation(userId: string, projectId: string, id: string): Promise<ExternalOperation> {
    await this.deps.builder.requireProject(userId, projectId);
    const operation = await this.deps.phase2.getOperation(userId, projectId, id);
    if (!operation) throw new BuilderError('not_found', 'Operation not found.');
    return operation;
  }

  async operations(userId: string, projectId: string): Promise<ExternalOperation[]> {
    await this.deps.builder.requireProject(userId, projectId);
    return this.deps.phase2.listOperations(userId, projectId);
  }

  /** The repository this project is bound to and which revision each commit holds. */
  async binding(userId: string, projectId: string): Promise<GitHubBinding | null> {
    const operations = (await this.operations(userId, projectId)).filter((operation) => operation.status === 'succeeded' && operation.receipt).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const creation = operations.find((operation) => operation.action === 'create_repository');
    if (!creation) return null;
    const receipt = (op: ExternalOperation) => op.receipt as { repository: GitHubBinding['repository']; commit: { sha: string }; revision: { id: string; number: number } };
    const commits = operations.map((operation) => ({ revisionNumber: receipt(operation).revision.number, revisionId: receipt(operation).revision.id, commitSha: receipt(operation).commit.sha, operationId: operation.id }));
    const last = operations[operations.length - 1];
    return { repository: receipt(creation).repository, lastCommitSha: receipt(last).commit.sha, lastRevisionNumber: receipt(last).revision.number, commits };
  }

  /** Performs an approved operation. Idempotent: a finished operation returns its receipt without any provider call. */
  async execute(userId: string, projectId: string, operationId: string): Promise<ExternalOperation> {
    const operation = await this.requireOperation(userId, projectId, operationId);
    if (operation.status === 'succeeded') return operation;
    if (operation.status === 'executing') throw new BuilderError('conflict', 'This operation is already running.');
    if (operation.status !== 'approved') throw new BuilderError('conflict', `This operation is ${operation.status}. It needs your explicit approval before it can run.`);
    if (!operation.approvalExpiresAt || new Date(operation.approvalExpiresAt).getTime() <= this.now().getTime()) {
      await this.deps.phase2.transitionOperation(userId, projectId, operationId, ['approved'], 'cancelled', { failure: 'The approval expired before the operation ran. Prepare it again.' });
      throw new BuilderError('conflict', 'The approval expired. Prepare the operation again and approve it.');
    }
    if (planDigest(operation.plan) !== operation.planDigest) throw new BuilderError('conflict', 'The stored plan no longer matches its approved digest.');
    const claimed = await this.deps.phase2.transitionOperation(userId, projectId, operationId, ['approved'], 'executing');
    if (!claimed) throw new BuilderError('conflict', 'This operation is already running or finished.');

    const fail = async (status: 'failed' | 'ambiguous' | 'diverged', message: string, receipt?: Record<string, unknown>): Promise<never> => {
      await this.deps.phase2.transitionOperation(userId, projectId, operationId, ['executing'], status, { failure: message.slice(0, 500), ...(receipt ? { receipt } : {}) });
      throw new BuilderError(status === 'diverged' ? 'conflict' : 'storage_failed', message);
    };

    const plan = operation.plan as GitHubPlan;
    let token: string;
    let viewer: GitHubViewer;
    try {
      const connection = await this.connection(userId);
      if (!connection) return await fail('failed', 'GitHub is no longer connected. Nothing was changed.');
      ({ token, viewer } = connection);
    } catch (error) {
      if (error instanceof BuilderError) throw error;
      return fail('failed', 'GitHub could not be reached. Nothing was changed.');
    }
    // The connected account must still be the one that was approved.
    if (viewer.id !== plan.viewer.id) return fail('failed', 'The connected GitHub account changed since this was approved. Nothing was changed.');

    let project: BuilderProject;
    let revision: BuilderRevision;
    let files: ProjectFile[];
    try {
      ({ project, revision } = await this.projectAndRevision(userId, projectId, plan.revision.id));
      if (revision.contentSha256 !== plan.revision.contentSha256) return await fail('failed', 'The revision no longer matches the approved plan. Nothing was changed.');
      files = this.filesFor(project, revision);
    } catch (error) {
      if (error instanceof BuilderError && error.code === 'conflict') throw error;
      return fail('failed', error instanceof BuilderError ? error.message : 'The source could not be prepared for export.');
    }
    const message = `Xroga: revision ${revision.revisionNumber}`;

    try {
      let repo: GitHubRepo;
      if (plan.action === 'create_repository') {
        const existing = await this.deps.github.getRepo(token, plan.owner.login, plan.repository.name);
        if (existing) {
          // Only a repository that THIS operation created (proven by its marker) may be continued.
          if (!existing.description?.includes(plan.marker) || existing.owner.id !== plan.owner.id) {
            return await fail('failed', `A repository named ${plan.owner.login}/${plan.repository.name} already exists and was not created by this export. Nothing was changed. Choose another name.`);
          }
          repo = existing;
        } else {
          try {
            repo = await this.deps.github.createRepo(token, { owner: plan.owner, viewerLogin: viewer.login, name: plan.repository.name, private: plan.repository.visibility === 'private', description: `Generated with Xroga. ${plan.marker}`.slice(0, MAX_REPOSITORY_DESCRIPTION) });
          } catch (error) {
            if (error instanceof GitHubPortError && error.ambiguous) {
              // The request may have succeeded. Look before concluding anything.
              const found = await this.deps.github.getRepo(token, plan.owner.login, plan.repository.name).catch(() => null);
              if (found?.description?.includes(plan.marker)) repo = found;
              else return await fail('ambiguous', 'GitHub did not confirm whether the repository was created. Check your GitHub account, then retry: a retry will adopt the repository only if this export created it.');
            } else throw error;
          }
        }
        if (repo.owner.id !== plan.owner.id) return await fail('failed', 'GitHub reports the repository under a different owner than the one approved. Nothing was pushed.', { repository: { id: repo.id, owner: repo.owner.login, name: repo.name, url: repo.htmlUrl, created: true } });
        if (repo.private !== (plan.repository.visibility === 'private')) return await fail('failed', 'The repository visibility does not match what was approved. Nothing was pushed.', { repository: { id: repo.id, owner: repo.owner.login, name: repo.name, url: repo.htmlUrl, created: true } });
      } else {
        const existing = await this.deps.github.getRepo(token, plan.owner.login, plan.repository.name);
        if (!existing || existing.id !== plan.repository.id) return await fail('failed', 'The bound GitHub repository could not be found or is no longer the same repository. Nothing was changed.');
        repo = existing;
      }

      const push = await this.deps.github.pushFiles(token, {
        owner: repo.owner.login, repo: repo.name, branch: plan.repository.branch, files, message,
        ...(plan.action === 'push_revision' ? { expectedHead: plan.expectedRemoteHead ?? null } : {}),
      });
      if (push.kind === 'diverged') {
        return await fail('diverged', 'The GitHub repository changed since the last sync. Nothing was pushed or overwritten. Review the changes on GitHub; you can export a ZIP instead.');
      }
      const repository = { id: repo.id, owner: repo.owner.login, ownerId: repo.owner.id, name: repo.name, url: repo.htmlUrl, private: repo.private, branch: plan.repository.branch };
      if (push.kind === 'verification_failed') {
        return await fail('failed', `GitHub's copy could not be verified: ${push.reason}`, { repository, partial: true, commit: { sha: push.commitSha } });
      }
      const receipt = {
        repository, commit: { sha: push.commitSha, treeSha: push.treeSha, parentSha: push.parentSha }, revision: { id: revision.id, number: revision.revisionNumber, contentSha256: revision.contentSha256 },
        verifiedFileCount: push.verifiedFiles, verifiedAt: this.now().toISOString(), authenticatedAs: { id: viewer.id, login: viewer.login },
      };
      const done = await this.deps.phase2.transitionOperation(userId, projectId, operationId, ['executing'], 'succeeded', { receipt });
      if (!done) throw new BuilderError('storage_failed', 'The repository was updated but the receipt could not be recorded. Retry to reconcile.');
      return done;
    } catch (error) {
      if (error instanceof BuilderError) throw error;
      if (error instanceof GitHubPortError) {
        return fail(error.ambiguous ? 'ambiguous' : 'failed', error.message);
      }
      return fail('failed', 'The GitHub export stopped unexpectedly. Nothing further was changed.');
    }
  }
}
