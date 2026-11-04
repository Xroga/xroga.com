/**
 * Shared pieces for the crash-recovery test: a small project with a real failing test, a change store that survives the process (one JSON file per
 * change), and a service built on the same real components the production path uses (the real ChangeService, a real process running the project's own
 * tests). The only fakes are GitHub and the agent, which is scripted. Nothing here spends money or touches a provider.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentSoftwareExecutorInput, AgentSoftwareExecutorResult } from '../../../ai/softwareAgent/AgentSoftwareExecutor.js';
import { FakeGitHub, type FakeFile } from '../../fakeGitHub.testsupport.js';
import { InMemoryCodeIndexStore } from '../../intelligence/codeIndexStore.js';
import { ExistingSourceIntelligence, IndexCoordinator } from '../../intelligence/service.js';
import { ExistingSourceService } from '../../service.js';
import { InMemorySourceBindingStore } from '../../store.js';
import { ChangeService, type AgentRunner } from '../service.js';
import type { ChangeStore } from '../store.js';
import type { ChangeTask } from '../types.js';
import type { ExistingSourceToolHost } from '../toolHost.js';
import { LocalProcessPort } from './localProcessPort.js';

export const ALICE = '11111111-1111-4111-8111-111111111111';

export const PROJECT: FakeFile[] = [
  { path: 'package.json', content: '{\n  "name": "cart",\n  "version": "1.0.0",\n  "scripts": { "test": "node --test" }\n}\n' },
  { path: 'src/pricing.js', content: 'function applyDiscount(price, percent) {\n  return price - percent;\n}\nmodule.exports = { applyDiscount };\n' },
  { path: 'test/pricing.test.js', content: "const test = require('node:test');\nconst assert = require('node:assert');\nconst { applyDiscount } = require('../src/pricing');\n\ntest('ten percent off two hundred is one eighty', () => {\n  assert.strictEqual(applyDiscount(200, 10), 180);\n});\n" },
];
export const WRONG_FIX = 'function applyDiscount(price, percent) {\n  return price - percent / 100;\n}\nmodule.exports = { applyDiscount };\n';
export const RIGHT_FIX = 'function applyDiscount(price, percent) {\n  return Math.round(price * (100 - percent)) / 100;\n}\nmodule.exports = { applyDiscount };\n';
export const INSTRUCTION = 'Fix the broken discount calculation in applyDiscount';

/** A change store whose rows outlive the process: one JSON file per change, written atomically. */
export class FileChangeStore implements ChangeStore {
  constructor(private readonly dir: string) { mkdirSync(dir, { recursive: true }); }
  private path(id: string) { return join(this.dir, `${id}.json`); }
  async save(userId: string, task: ChangeTask): Promise<void> {
    if (task.ownerUserId !== userId) throw new Error('owner mismatch');
    const tmp = this.path(task.id) + '.tmp';
    writeFileSync(tmp, JSON.stringify(task)); renameSync(tmp, this.path(task.id));
  }
  async get(userId: string, changeId: string): Promise<ChangeTask | null> {
    if (!existsSync(this.path(changeId))) return null;
    const task = JSON.parse(readFileSync(this.path(changeId), 'utf8')) as ChangeTask;
    return task.ownerUserId === userId ? task : null;
  }
  async list(userId: string, bindingId: string, limit = 50): Promise<ChangeTask[]> {
    return readdirSync(this.dir).filter((n) => n.endsWith('.json')).map((n) => JSON.parse(readFileSync(join(this.dir, n), 'utf8')) as ChangeTask)
      .filter((t) => t.ownerUserId === userId && t.bindingId === bindingId).slice(0, limit);
  }
  async deleteForBinding(userId: string, bindingId: string): Promise<void> { for (const t of await this.list(userId, bindingId, 1000)) await this.delete(userId, t.id); }
  async delete(userId: string, changeId: string): Promise<void> { if ((await this.get(userId, changeId)) && existsSync(this.path(changeId))) rmSync(this.path(changeId)); }
  /** Test access to the durable row exactly as a restarted process would find it. */
  raw(changeId: string): ChangeTask { return JSON.parse(readFileSync(this.path(changeId), 'utf8')) as ChangeTask; }
  rebind(changeId: string, bindingId: string): void { const t = this.raw(changeId); writeFileSync(this.path(changeId), JSON.stringify({ ...t, bindingId })); }
}

export type Step = (host: ExistingSourceToolHost, input: AgentSoftwareExecutorInput) => Promise<void>;
export const agent = (step: Step): AgentRunner => async (input) => {
  await step(input.host as ExistingSourceToolHost, input);
  const result: AgentSoftwareExecutorResult = { status: 'implemented', evidence: { changedFiles: [], checks: [] }, blockers: [], outputText: 'done', iterations: 1 };
  return result;
};

/** The same components the production path composes; only GitHub and the agent are scripted. */
export function buildService(dir: string, runAgent: AgentRunner, maxAttempts?: number) {
  const gh = new FakeGitHub();
  gh.addAccount('tok-alice', '501', 'alice');
  const repo = gh.addRepo({ fullName: 'acme/cart', ownerId: '501', files: PROJECT, access: { '501': { pull: true, push: true } } });
  const source = new ExistingSourceService({ store: new InMemorySourceBindingStore(), tokenFor: async (u) => (u === ALICE ? 'tok-alice' : null), portFor: (t) => gh.port(t), treeCache: new Map(), verifyMaxAgeMs: 0 });
  const intel = new ExistingSourceIntelligence({ source, store: new InMemoryCodeIndexStore(), coordinator: new IndexCoordinator() });
  const store = new FileChangeStore(join(dir, 'changes'));
  const changes = new ChangeService({ source, intel, store, execution: new LocalProcessPort(), runAgent, modelRouteFor: async () => ({}) as never, maxAttempts,
    snapshotLimits: { maxFiles: 3000, maxBytes: 24 * 1024 * 1024, maxFileBytes: 512 * 1024, concurrency: 4 } });
  const link = async () => (await source.link(ALICE, { repositoryId: repo })).binding;
  return { changes, store, source, link };
}
