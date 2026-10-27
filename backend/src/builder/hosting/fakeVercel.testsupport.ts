import type { ProjectFile } from '../../ai/patches.js';
import { VercelPortError, type VercelDeployment, type VercelEnvVar, type VercelPort, type VercelProject, type VercelReadyState, type VercelScope, type VercelViewer } from './port.js';

/**
 * In-memory Vercel for tests. It models what matters for release safety: whether a project is
 * Git-linked, which target a deployment has, what metadata it carries, build progress and errors,
 * and promotion. Failure modes: lost responses, a build that errors or never finishes, a deployment
 * that wrongly reports production, a deployment that lost its identity metadata.
 */
export interface FakeVercelFailures {
  createProject?: 'timeout_after_create' | 'timeout_before_create' | 'creates_git_linked';
  deployment?: 'error' | 'never_ready' | 'target_production' | 'wrong_meta';
  promote?: 'timeout';
}

interface FakeAccount {
  readonly viewer: VercelViewer;
  readonly teams: Array<{ id: string; slug: string; name: string }>;
}

interface StoredDeployment extends VercelDeployment {
  polls: number;
  files: readonly ProjectFile[];
}

export class FakeVercel implements VercelPort {
  readonly accounts = new Map<string, FakeAccount>();
  readonly projects = new Map<string, VercelProject & { gitLinked: boolean }>();
  readonly env: Array<{ projectId: string; vars: readonly VercelEnvVar[] }> = [];
  readonly deployments = new Map<string, StoredDeployment>();
  readonly promoted: Array<{ projectId: string; deploymentId: string }> = [];
  readonly calls: string[] = [];
  failures: FakeVercelFailures = {};
  /** Polls before a new deployment becomes READY. */
  pollsUntilReady = 2;
  private nextId = 1;

  addAccount(token: string, viewer: VercelViewer, teams: Array<{ id: string; slug: string; name: string }> = []): void {
    this.accounts.set(token, { viewer, teams });
  }

  private account(token: string): FakeAccount {
    const account = this.accounts.get(token);
    if (!account) throw new VercelPortError('unauthorized', 'bad token');
    return account;
  }

  private key(scope: VercelScope, name: string): string {
    return `${scope.id ?? 'personal'}/${name}`;
  }

  async viewer(token: string): Promise<VercelViewer> {
    this.calls.push('viewer');
    return this.account(token).viewer;
  }

  async scopes(token: string, viewer: VercelViewer): Promise<VercelScope[]> {
    this.calls.push('scopes');
    return [{ kind: 'personal', id: null, slug: viewer.username, name: viewer.username }, ...this.account(token).teams.map((team) => ({ kind: 'team' as const, id: team.id, slug: team.slug, name: team.name }))];
  }

  async getProject(token: string, scope: VercelScope, name: string): Promise<VercelProject | null> {
    this.calls.push(`getProject ${name}`);
    this.account(token);
    return this.projects.get(this.key(scope, name)) ?? null;
  }

  async createProject(token: string, scope: VercelScope, input: { name: string; framework: string | null }): Promise<VercelProject> {
    this.calls.push(`createProject ${input.name}`);
    this.account(token);
    if (this.failures.createProject === 'timeout_before_create') throw new VercelPortError('unavailable', 'unreachable', true);
    const project = { id: `prj_${this.nextId++}abcdefgh`, name: input.name, accountId: scope.id ?? 'personal', gitLinked: this.failures.createProject === 'creates_git_linked', framework: input.framework };
    this.projects.set(this.key(scope, input.name), project);
    if (this.failures.createProject === 'timeout_after_create') throw new VercelPortError('unavailable', 'unreachable', true);
    return project;
  }

  async setEnv(token: string, _scope: VercelScope, projectId: string, vars: readonly VercelEnvVar[]): Promise<void> {
    this.calls.push('setEnv');
    this.account(token);
    this.env.push({ projectId, vars });
  }

  async createPreviewDeployment(token: string, scope: VercelScope, input: { projectName: string; files: readonly ProjectFile[]; framework: string | null; meta: Readonly<Record<string, string>> }): Promise<VercelDeployment> {
    this.calls.push('createPreviewDeployment');
    this.account(token);
    const project = this.projects.get(this.key(scope, input.projectName));
    if (!project) throw new VercelPortError('not_found', 'no such project');
    const id = `dpl_${this.nextId++}abcdefgh`;
    const meta = this.failures.deployment === 'wrong_meta' ? {} : { ...input.meta };
    const deployment: StoredDeployment = { id, url: `${input.projectName}-${id.slice(4, 10)}.vercel.app`, readyState: 'QUEUED', target: this.failures.deployment === 'target_production' ? 'production' : null, projectId: project.id, meta, errorMessage: null, polls: 0, files: input.files };
    this.deployments.set(id, deployment);
    return this.public(deployment);
  }

  private public(deployment: StoredDeployment): VercelDeployment {
    const { polls: _polls, files: _files, ...rest } = deployment;
    return rest;
  }

  async getDeployment(token: string, _scope: VercelScope, deploymentId: string): Promise<VercelDeployment> {
    this.calls.push(`getDeployment ${deploymentId}`);
    this.account(token);
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) throw new VercelPortError('not_found', 'no such deployment');
    deployment.polls++;
    let state: VercelReadyState = deployment.readyState;
    if (this.failures.deployment === 'never_ready') state = 'BUILDING';
    else if (deployment.polls > this.pollsUntilReady) state = this.failures.deployment === 'error' ? 'ERROR' : 'READY';
    else if (deployment.polls > 0) state = 'BUILDING';
    Object.assign(deployment, { readyState: state });
    return this.public(deployment);
  }

  async buildLogTail(): Promise<string> {
    return 'Error: Cannot find module "left-pad"\nBuild failed';
  }

  async promote(token: string, _scope: VercelScope, projectId: string, deploymentId: string): Promise<void> {
    this.calls.push(`promote ${deploymentId}`);
    this.account(token);
    if (this.failures.promote === 'timeout') {
      this.promoted.push({ projectId, deploymentId });
      throw new VercelPortError('unavailable', 'unreachable', true);
    }
    this.promoted.push({ projectId, deploymentId });
  }
}
