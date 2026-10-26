import type { ProjectFile } from '../../ai/patches.js';

/**
 * The narrow Vercel surface the builder needs, restricted to documented REST endpoints.
 *
 * Release control by construction: Vercel's REST API documents no way to set a project's production
 * branch or to disable Git deployments, so a Git-linked project cannot be made safe from automatic
 * production publication. The builder therefore only ever creates and uses projects that are NOT
 * linked to Git, and deploys the verified revision's files explicitly. A push to GitHub cannot
 * publish anything. A project that is already Git-linked is refused, not "warned about".
 */

export interface VercelViewer {
  readonly id: string;
  readonly username: string;
}

export interface VercelScope {
  readonly kind: 'personal' | 'team';
  /** Team id (team_...) for a team scope, null for the personal account. */
  readonly id: string | null;
  readonly slug: string;
  readonly name: string;
}

export interface VercelProject {
  readonly id: string;
  readonly name: string;
  readonly accountId: string;
  /** True when the project is linked to a Git repository (and so can publish on push). */
  readonly gitLinked: boolean;
  readonly framework: string | null;
}

export type VercelReadyState = 'QUEUED' | 'INITIALIZING' | 'BUILDING' | 'READY' | 'ERROR' | 'CANCELED' | 'DELETED';

export interface VercelDeployment {
  readonly id: string;
  /** Host name, without scheme. */
  readonly url: string;
  readonly readyState: VercelReadyState;
  /** Null or 'preview' for previews; 'production' for production. */
  readonly target: string | null;
  readonly projectId: string;
  readonly meta: Readonly<Record<string, string>>;
  readonly errorMessage: string | null;
}

export interface VercelEnvVar {
  readonly key: string;
  readonly value: string;
  /** Only preview is ever written by the builder's preview flow. */
  readonly target: ReadonlyArray<'preview' | 'production' | 'development'>;
  readonly type: 'plain' | 'encrypted' | 'sensitive';
}

export type VercelFailure = 'unauthorized' | 'forbidden' | 'not_found' | 'conflict' | 'rate_limited' | 'validation' | 'unavailable';

export class VercelPortError extends Error {
  constructor(
    readonly code: VercelFailure,
    message: string,
    /** True when the provider may have applied the request even though the call failed. */
    readonly ambiguous = false,
  ) {
    super(message);
    this.name = 'VercelPortError';
  }
}

export interface VercelPort {
  viewer(token: string): Promise<VercelViewer>;
  scopes(token: string, viewer: VercelViewer): Promise<VercelScope[]>;
  getProject(token: string, scope: VercelScope, name: string): Promise<VercelProject | null>;
  /** Creates a project that is NOT linked to Git. */
  createProject(token: string, scope: VercelScope, input: { name: string; framework: string | null }): Promise<VercelProject>;
  setEnv(token: string, scope: VercelScope, projectId: string, vars: readonly VercelEnvVar[]): Promise<void>;
  /** Deploys files as a PREVIEW (no target). */
  createPreviewDeployment(token: string, scope: VercelScope, input: { projectName: string; files: readonly ProjectFile[]; framework: string | null; meta: Readonly<Record<string, string>> }): Promise<VercelDeployment>;
  getDeployment(token: string, scope: VercelScope, deploymentId: string): Promise<VercelDeployment>;
  /** The tail of the deployment's build log, for failure messages. */
  buildLogTail(token: string, scope: VercelScope, deploymentId: string): Promise<string>;
  /** Points production at an existing, already built deployment. Does not rebuild. */
  promote(token: string, scope: VercelScope, projectId: string, deploymentId: string): Promise<void>;
}

export const VERCEL_PROJECT_NAME = /^[a-z0-9][a-z0-9._-]{0,98}[a-z0-9]$|^[a-z0-9]$/;
export const VERCEL_TEAM_ID = /^team_[A-Za-z0-9]{8,40}$/;
