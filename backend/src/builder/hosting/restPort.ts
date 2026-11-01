import { VERCEL_PROJECT_NAME, VERCEL_TEAM_ID, VercelPortError, type VercelDeployment, type VercelEnvVar, type VercelPort, type VercelProject, type VercelReadyState, type VercelScope, type VercelViewer } from './port.js';
import { builderAdmissionDenied, isBuilderSecurityDenial } from '../providerAuthority.js';

/** (token, path, init) => Response against the Vercel REST API. Injected in tests. */
export type VercelTransport = (token: string, path: string, init?: RequestInit) => Promise<Response>;

export const vercelFetch: VercelTransport = async () => { throw builderAdmissionDenied(); };

function failure(response: Response, action: string, ambiguousOnServerError: boolean): VercelPortError {
  const status = response.status;
  if (status === 401) return new VercelPortError('unauthorized', 'Vercel rejected the connection. Reconnect your Vercel account in Xroga.');
  if (status === 403) return new VercelPortError('forbidden', `Vercel denied this action (${action}). The connection may lack permission for this account or team.`);
  if (status === 404) return new VercelPortError('not_found', `Vercel could not find the resource (${action}).`);
  if (status === 409) return new VercelPortError('conflict', `Vercel reports a conflict (${action}).`);
  if (status === 429) return new VercelPortError('rate_limited', 'Vercel is rate limiting requests. Try again shortly.');
  if (status === 400 || status === 422) return new VercelPortError('validation', `Vercel rejected the request (${action}). Nothing was changed.`);
  return new VercelPortError('unavailable', 'Vercel is temporarily unavailable.', ambiguousOnServerError);
}

const READY_STATES: readonly VercelReadyState[] = ['QUEUED', 'INITIALIZING', 'BUILDING', 'READY', 'ERROR', 'CANCELED', 'DELETED'];

const teamQuery = (scope: VercelScope, extra = ''): string => {
  if (scope.id !== null && !VERCEL_TEAM_ID.test(scope.id)) throw new VercelPortError('validation', 'Invalid team identifier.');
  const params = [scope.id ? `teamId=${encodeURIComponent(scope.id)}` : '', extra].filter(Boolean).join('&');
  return params ? `?${params}` : '';
};

const safeName = (name: string): string => {
  if (!VERCEL_PROJECT_NAME.test(name)) throw new VercelPortError('validation', 'Invalid project name.');
  return name;
};

const safeId = (id: string): string => {
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(id)) throw new VercelPortError('validation', 'Invalid identifier.');
  return id;
};

export function createRestVercelPort(transport: VercelTransport = vercelFetch): VercelPort {
  const call = async (token: string, path: string, init: RequestInit | undefined, ambiguous = false): Promise<Response> => {
    try {
      return await transport(token, path, init);
    } catch (error) {
      if (isBuilderSecurityDenial(error)) throw error;
      throw new VercelPortError('unavailable', 'Vercel could not be reached.', ambiguous);
    }
  };
  const post = (value: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(value) });
  const json = async <T>(response: Response): Promise<T> => (await response.json().catch(() => ({}))) as T;

  const toProject = (raw: Record<string, unknown>): VercelProject | null => {
    if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;
    return { id: raw.id, name: raw.name, accountId: typeof raw.accountId === 'string' ? raw.accountId : '', gitLinked: Boolean(raw.link), framework: typeof raw.framework === 'string' ? raw.framework : null };
  };
  const toDeployment = (raw: Record<string, unknown>): VercelDeployment | null => {
    const state = String(raw.readyState ?? raw.status ?? '').toUpperCase() as VercelReadyState;
    if (typeof raw.id !== 'string' || typeof raw.url !== 'string' || !READY_STATES.includes(state)) return null;
    const meta = raw.meta && typeof raw.meta === 'object' ? Object.fromEntries(Object.entries(raw.meta as Record<string, unknown>).filter(([, v]) => typeof v === 'string')) as Record<string, string> : {};
    return {
      id: raw.id, url: raw.url.replace(/^https?:\/\//, ''), readyState: state, target: typeof raw.target === 'string' ? raw.target : null,
      projectId: typeof raw.projectId === 'string' ? raw.projectId : '', meta, errorMessage: typeof raw.errorMessage === 'string' ? raw.errorMessage : null,
    };
  };

  return {
    async viewer(token): Promise<VercelViewer> {
      const response = await call(token, '/v2/user', undefined);
      if (!response.ok) throw failure(response, 'read account', false);
      const body = await json<{ user?: { id?: string; username?: string } }>(response);
      if (!body.user?.id || !body.user.username) throw new VercelPortError('unavailable', 'Vercel returned an unexpected account response.');
      return { id: body.user.id, username: body.user.username };
    },

    async scopes(token, viewer): Promise<VercelScope[]> {
      const scopes: VercelScope[] = [{ kind: 'personal', id: null, slug: viewer.username, name: viewer.username }];
      const response = await call(token, '/v2/teams', undefined);
      if (!response.ok) throw failure(response, 'list teams', false);
      for (const team of (await json<{ teams?: Array<{ id?: string; slug?: string; name?: string }> }>(response)).teams ?? []) {
        if (typeof team.id === 'string' && VERCEL_TEAM_ID.test(team.id) && typeof team.slug === 'string') scopes.push({ kind: 'team', id: team.id, slug: team.slug, name: team.name ?? team.slug });
      }
      return scopes;
    },

    async getProject(token, scope, name): Promise<VercelProject | null> {
      const response = await call(token, `/v9/projects/${safeName(name)}${teamQuery(scope)}`, undefined);
      if (response.status === 404) return null;
      if (!response.ok) throw failure(response, 'read project', false);
      return toProject(await json<Record<string, unknown>>(response));
    },

    async createProject(token, scope, input): Promise<VercelProject> {
      // No gitRepository: the project cannot publish from Git pushes.
      const response = await call(token, `/v11/projects${teamQuery(scope)}`, post({ name: safeName(input.name), framework: input.framework }), true);
      if (response.status === 409) throw new VercelPortError('conflict', 'A project with that name already exists.');
      if (!response.ok) throw failure(response, 'create project', true);
      const project = toProject(await json<Record<string, unknown>>(response));
      if (!project) throw new VercelPortError('unavailable', 'Vercel created a project but returned an unreadable response.', true);
      return project;
    },

    async setEnv(token, scope, projectId, vars): Promise<void> {
      if (vars.length === 0) return;
      const response = await call(token, `/v10/projects/${safeId(projectId)}/env${teamQuery(scope, 'upsert=true')}`, post(vars.map((entry: VercelEnvVar) => ({ key: entry.key, value: entry.value, type: entry.type, target: entry.target }))), true);
      if (!response.ok) throw failure(response, 'set environment variables', true);
    },

    async createPreviewDeployment(token, scope, input): Promise<VercelDeployment> {
      const body = {
        name: safeName(input.projectName),
        project: input.projectName,
        files: input.files.map((file) => ({ file: file.path, data: Buffer.from(file.content, 'utf8').toString('base64'), encoding: 'base64' })),
        meta: input.meta,
        ...(input.framework ? { projectSettings: { framework: input.framework } } : {}),
        // `target` is deliberately never set: an omitted target is a preview deployment.
      };
      const response = await call(token, `/v13/deployments${teamQuery(scope, 'forceNew=1&skipAutoDetectionConfirmation=1')}`, post(body), true);
      if (!response.ok) throw failure(response, 'create deployment', true);
      const deployment = toDeployment(await json<Record<string, unknown>>(response));
      if (!deployment) throw new VercelPortError('unavailable', 'Vercel created a deployment but returned an unreadable response.', true);
      return deployment;
    },

    async getDeployment(token, scope, deploymentId): Promise<VercelDeployment> {
      const response = await call(token, `/v13/deployments/${safeId(deploymentId)}${teamQuery(scope)}`, undefined);
      if (!response.ok) throw failure(response, 'read deployment', false);
      const deployment = toDeployment(await json<Record<string, unknown>>(response));
      if (!deployment) throw new VercelPortError('unavailable', 'Vercel returned an unreadable deployment.');
      return deployment;
    },

    async buildLogTail(token, scope, deploymentId): Promise<string> {
      const response = await call(token, `/v3/deployments/${safeId(deploymentId)}/events${teamQuery(scope, 'limit=40')}`, undefined);
      if (!response.ok) return '';
      const events = await json<unknown>(response);
      if (!Array.isArray(events)) return '';
      return events
        .map((event) => (event && typeof event === 'object' && typeof (event as { text?: unknown }).text === 'string' ? ((event as { text: string }).text) : ''))
        .filter(Boolean)
        .slice(-15)
        .join('\n')
        .slice(-1500);
    },

    async promote(token, scope, projectId, deploymentId): Promise<void> {
      const response = await call(token, `/v10/projects/${safeId(projectId)}/promote/${safeId(deploymentId)}${teamQuery(scope)}`, { method: 'POST' }, true);
      if (!response.ok && response.status !== 201 && response.status !== 202) throw failure(response, 'promote deployment', true);
    },
  };
}
