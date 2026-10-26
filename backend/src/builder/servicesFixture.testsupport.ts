import { FakeSupabase } from './data/fakeSupabase.testsupport.js';
import { SupabaseDataService } from './data/service.js';
import { deliveryByRevision } from './delivery.js';
import { ExportService } from './export/service.js';
import { FakeGitHub } from './github/fakeGitHub.testsupport.js';
import { GitHubExportService } from './github/service.js';
import { FakeVercel } from './hosting/fakeVercel.testsupport.js';
import { HostingService, type HttpProbeResult, type RemoteVerification } from './hosting/service.js';
import type { Phase2Services } from './phase2Bridge.js';
import { InMemoryPhase2Store } from './phase2Store.js';
import { QaService } from './qa/qaService.js';
import type { QaDriver, QaPage } from './qa/types.js';
import { BuilderService, type BuildRunner } from './service.js';
import { InMemoryBuilderStore } from './store.js';

/** A complete in-memory service set with every provider replaced by its faithful fake. Tests only. */
export interface ServicesFixture {
  readonly store: InMemoryBuilderStore;
  readonly phase2: InMemoryPhase2Store;
  readonly builder: BuilderService;
  readonly services: Phase2Services;
  readonly github: FakeGitHub;
  readonly supabase: FakeSupabase;
  readonly vercel: FakeVercel;
  readonly tokens: { github: Map<string, string>; supabase: Map<string, string>; vercel: Map<string, string> };
  readonly runtime: { available: boolean };
  readonly remote: { result: RemoteVerification; probe: HttpProbeResult };
}

/** A page that follows links the way a browser does, so navigation checks are meaningful. */
const okPage = (): QaPage => {
  let path = '/';
  return {
  goto: async (target) => { path = String(target).split('#')[0] || '/'; return { status: 200 }; },
  click: async (selector) => { const href = /href=["']?([^"'\]\s]+)/.exec(String(selector))?.[1]; if (href && href.startsWith('/')) path = href; }, fill: async () => {}, reload: async () => {}, bodyText: async () => 'Welcome', isVisible: async () => true,
  currentPath: () => path, hasHorizontalOverflow: async () => false, hasViewportMeta: async () => true, formIsInvalid: async () => true, submitForm: async () => {},
  screenshot: async () => Buffer.from('x'), drainDiagnostics: () => ({ consoleErrors: [], pageErrors: [], failedRequests: [] }), close: async () => {},
  };
};
const okDriver: QaDriver = { name: 'fake', browserVersion: async () => 'fake-1', open: async () => okPage(), close: async () => {} };

export function makeServices(users: ReadonlyArray<{ id: string; github?: { token: string; login: string; id: number }; supabase?: { token: string; projects: Array<{ ref: string; name: string }> }; vercel?: { token: string; id: string; username: string } }>, options: { runBuild?: BuildRunner } = {}): ServicesFixture {
  const store = new InMemoryBuilderStore();
  const phase2 = new InMemoryPhase2Store(store);
  const builder = new BuilderService({ store, runBuild: options.runBuild ?? (async () => null) });
  const github = new FakeGitHub();
  const supabase = new FakeSupabase();
  const vercel = new FakeVercel();
  const tokens = { github: new Map<string, string>(), supabase: new Map<string, string>(), vercel: new Map<string, string>() };
  for (const user of users) {
    if (user.github) {
      github.addUser(user.github.token, { id: user.github.id, login: user.github.login, scopes: ['repo'], orgs: [] });
      tokens.github.set(user.id, user.github.token);
    }
    if (user.supabase) {
      supabase.addAccount(user.supabase.token, user.supabase.projects);
      tokens.supabase.set(user.id, user.supabase.token);
    }
    if (user.vercel) {
      vercel.addAccount(user.vercel.token, { id: user.vercel.id, username: user.vercel.username });
      tokens.vercel.set(user.id, user.vercel.token);
    }
  }
  const runtime = { available: false };
  const remote: ServicesFixture['remote'] = {
    result: { status: 'passed', executedChecks: 6, failedChecks: 0, reason: 'All 6 executed check(s) passed.' },
    probe: { status: 200, bytes: 400, protectedBySso: false, errorMarker: null },
  };
  const qa = new QaService({
    builder, store, phase2,
    target: { ensure: async () => (runtime.available ? { baseUrl: 'http://127.0.0.1:9', environment: { database: false } } : null) },
    openDriver: async () => okDriver, repair: async () => ({ revision: null, reason: 'no agent in tests', noChange: true }), budgetAllows: async () => true,
  });
  const githubService = new GitHubExportService({ phase2, builder, github, tokenFor: async (userId) => tokens.github.get(userId) ?? null });
  const data = new SupabaseDataService({ phase2, builder, supabase, tokenFor: async (userId) => tokens.supabase.get(userId) ?? null });
  const hosting = new HostingService({
    phase2, builder, vercel, sleep: async () => {}, pollIntervalMs: 1, maxPolls: 10, tokenFor: async (userId) => tokens.vercel.get(userId) ?? null,
    appEnvironment: (userId, projectId) => data.appEnvironment(userId, projectId),
    filesFor: (project, revision) => githubService.filesFor(project, revision),
    githubCommitFor: async (userId, projectId, revisionId) => (await githubService.binding(userId, projectId))?.commits.find((commit) => commit.revisionId === revisionId)?.commitSha ?? null,
    remoteQa: async () => remote.result,
    probe: async () => remote.probe,
  });
  const provenance = async (userId: string, projectId: string) => {
    await builder.requireProject(userId, projectId);
    const [a, b, c, revisions] = await Promise.all([githubService.operations(userId, projectId), data.operations(userId, projectId), hosting.operations(userId, projectId), builder.history(userId, projectId)]);
    return deliveryByRevision([...a, ...b, ...c], revisions);
  };
  const services: Phase2Services = { builder, qa, github: githubService, exporter: new ExportService({ builder, phase2 }), data, hosting, provenance };
  return { store, phase2, builder, services, github, supabase, vercel, tokens, runtime, remote };
}
