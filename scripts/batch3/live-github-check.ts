/**
 * Manual live check of Batch 3 against REAL GitHub, on one disposable test repository, with persistence in a LOCAL Supabase stack.
 *
 *   npx supabase start
 *   GITHUB_TEST_REPO=Xroga/blogsite SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<local key> npx tsx scripts/batch3/live-github-check.ts
 *
 * Real: the GitHub REST reads of the repository, the exact-commit binding, the code map, the Batch 3 stores, and the review branch and
 * DRAFT pull request written by the atomic writer. The coding model is scripted (a deterministic edit through the real tool host) unless
 * LIVE_MODEL=1, in which case the real Xroga coding route and agent run, using OPENROUTER_API_KEY from backend/.env.local (never printed),
 * with a hard spend ceiling (LIVE_MODEL_MAX_USD, default 0.25) enforced from the local usage ledger: the run is cancelled when it is reached.
 * Safety: every GitHub request goes through a guard that allows reads anywhere but writes ONLY under /repos/<GITHUB_TEST_REPO>/, and the
 * script refuses any repository other than the one named, any non-loopback Supabase URL, and cleans up the branch and PR it created.
 */
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

import type { AgentSoftwareExecutorInput, AgentSoftwareExecutorResult } from '../../backend/src/ai/softwareAgent/AgentSoftwareExecutor.js';
import { getSupabaseAdmin } from '../../backend/src/config/supabase.js';
import { createTenantContext } from '../../backend/src/security/tenantContext.js';
import { SupabaseArchiveStore } from '../../backend/src/existingSource/archive/archiveStore.js';
import { ChangeDelivery, type DeliveryApi } from '../../backend/src/existingSource/change/delivery.js';
import { LocalProcessPort } from '../../backend/src/existingSource/change/localProcessPort.testsupport.js';
import { ChangeService, type AgentRunner } from '../../backend/src/existingSource/change/service.js';
import { SupabaseChangeStore } from '../../backend/src/existingSource/change/store.js';
import type { ExistingSourceToolHost } from '../../backend/src/existingSource/change/toolHost.js';
import { SupabaseCodeIndexStore } from '../../backend/src/existingSource/intelligence/codeIndexStore.js';
import { ExistingSourceIntelligence } from '../../backend/src/existingSource/intelligence/service.js';
import { createRestSourcePort } from '../../backend/src/existingSource/provider.js';
import { ExistingSourceService } from '../../backend/src/existingSource/service.js';
import { SupabaseSourceBindingStore } from '../../backend/src/existingSource/store.js';
import { makeAtomicWriteApi } from '../../backend/src/services/integrations/githubAtomicTransport.js';

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
const LIVE_MODEL = process.env.LIVE_MODEL === '1';
const MAX_USD = Number(process.env.LIVE_MODEL_MAX_USD ?? '0.25');
if (LIVE_MODEL) {
  const envFile = resolve(dirname(process.argv[1] ?? '.'), '../../backend/.env.local');
  const line = existsSync(envFile) ? readFileSync(envFile, 'utf8').split(/\r?\n/).find((l) => l.startsWith('OPENROUTER_API_KEY=')) : undefined;
  const key = line?.slice('OPENROUTER_API_KEY='.length).trim();
  if (!key) throw new Error('LIVE_MODEL=1 needs OPENROUTER_API_KEY=<key> in backend/.env.local.');
  process.env.OPENROUTER_API_KEY = key;
  if (!(MAX_USD > 0 && MAX_USD <= 0.3)) throw new Error('LIVE_MODEL_MAX_USD must be between 0 and 0.30.');
}
const REPO = process.env.GITHUB_TEST_REPO ?? '';
if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(REPO)) throw new Error('Set GITHUB_TEST_REPO=owner/name.');
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(process.env.SUPABASE_URL ?? '')) throw new Error('Refusing to run: SUPABASE_URL must be a local loopback address.');
const [OWNER, NAME] = REPO.split('/') as [string, string];
const token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
const ALLOWED_WRITE = `/repos/${OWNER}/${NAME}/`;

/** Reads anywhere on api.github.com; writes only inside the one test repository. */
const guardedPath = (method: string, path: string): void => {
  if (method !== 'GET' && method !== 'HEAD' && !path.startsWith(ALLOWED_WRITE)) throw new Error(`GUARD: refused ${method} ${path}`);
};
const guardedFetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const u = new URL(typeof url === 'string' ? url : url instanceof URL ? url.href : url.url);
  guardedPath((init?.method ?? 'GET').toUpperCase(), u.pathname);
  return fetch(url as never, init);
}) as typeof fetch;
const guardedGh = async (tok: string, path: string, init?: RequestInit): Promise<Response> => {
  guardedPath((init?.method ?? 'GET').toUpperCase(), path.split('?')[0]!);
  return fetch(`https://api.github.com${path}`, { ...init, headers: { Authorization: `Bearer ${tok}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(init?.headers ?? {}) } });
};

const results: string[] = [];
const pass = (what: string) => { results.push(what); console.log(`PASS  ${what}`); };
const gh = (...args: string[]) => execFileSync('gh', args, { encoding: 'utf8' }).trim();

async function main() {
  const admin = getSupabaseAdmin();
  const created = await admin.auth.admin.createUser({ email: 'b3-gh-live@example.test', password: 'Local-test-1!', email_confirm: true });
  let userId = created.data.user?.id;
  if (!userId) userId = (await admin.auth.admin.listUsers({ perPage: 200 })).data.users.find((u) => u.email === 'b3-gh-live@example.test')?.id;
  if (!userId) throw new Error('no local test user');
  const ctx = createTenantContext({ userId, via: 'persisted_owner' });

  const indexes = new SupabaseCodeIndexStore(ctx); const archives = new SupabaseArchiveStore(ctx); const changeStore = new SupabaseChangeStore(ctx);
  const source = new ExistingSourceService({
    store: new SupabaseSourceBindingStore(ctx), tokenFor: async () => token, portFor: (t) => createRestSourcePort(t, guardedFetch), archives, treeCache: new Map(),
    onBindingClosed: async (u, id) => { await indexes.deleteForBinding(u, id); await archives.deleteForBinding(u, id); await changeStore.deleteForBinding(u, id); },
  });
  const intel = new ExistingSourceIntelligence({ source, store: indexes });

  const agent: AgentRunner = async (input: AgentSoftwareExecutorInput) => {
    const host = input.host as ExistingSourceToolHost;
    const [html] = await host.readFiles(input.contract, ['index.html']);
    const [css] = await host.readFiles(input.contract, ['styles.css']);
    assert.ok(html && css, 'expected index.html and styles.css');
    await host.writeFile(input.contract, 'index.html', html.content.replace('</body>', '  <section class="about"><h2>About this site</h2><p>A small blog built with plain HTML.</p></section>\n</body>'), 'modify');
    await host.writeFile(input.contract, 'styles.css', `${css.content.replace(/\s*$/, '\n')}.about { margin: 2rem 0; }\n`, 'modify');
    return { status: 'implemented', evidence: { changedFiles: [], checks: [] }, blockers: [], outputText: 'done', iterations: 1 } as AgentSoftwareExecutorResult;
  };
  const production = LIVE_MODEL ? await import('../../backend/src/existingSource/change/production.js') : null;
  const changes = new ChangeService({ source, intel, store: changeStore, execution: new LocalProcessPort(), runAgent: production ? production.productionAgentRunner : agent,
    modelRouteFor: production ? production.selectCodingModelRoute : async () => ({}) as never, maxAttempts: LIVE_MODEL ? 1 : undefined });
  const delivery = new ChangeDelivery({ source, store: changeStore, apiFor: async (_u, binding) => makeAtomicWriteApi(guardedGh as never, token, OWNER, NAME) as DeliveryApi & { binding?: unknown } });

  // 1. pick the test repository by name and link it (real GitHub reads)
  let choice: { id: string; fullName: string } | undefined;
  for (let page = 1; page <= 10 && !choice; page++) { const listed = await source.listRepositories(userId, page); choice = listed.repositories.find((r) => r.fullName === REPO); if (!listed.hasMore) break; }
  assert.ok(choice, `${REPO} is not visible to the connected account`);
  const binding = (await source.link(userId, { repositoryId: choice.id })).binding;
  assert.equal(binding.repositoryFullName, REPO);
  assert.match(binding.baseCommitSha, /^[0-9a-f]{40}$/);
  pass(`linked ${REPO} at an exact commit (${binding.baseCommitSha.slice(0, 8)}), binding persisted locally`);

  // 2. real code map of the real repository
  const indexed = await intel.ensure(userId, binding.id, { force: true });
  pass(`code map built from the real repository (${JSON.stringify(indexed).slice(0, 120)})`);

  // 3. a change is made through the real tool host against the real files; the result is honest about verification
  const task = await changes.create(userId, binding.id, 'Add a short About this site section to `index.html` and style it in `styles.css`');
  const startedAt = new Date().toISOString();
  const spent = async (): Promise<number> => { const { data } = await admin.from('ai_usage_ledger').select('cost_usd').eq('user_id', userId).gte('created_at', startedAt); return (data ?? []).reduce((n, r) => n + Number(r.cost_usd ?? 0), 0); };
  let ceilingHit = false;
  const guard = LIVE_MODEL ? setInterval(() => { void spent().then((usd) => { if (usd >= MAX_USD && !ceilingHit) { ceilingHit = true; console.log('SPEND CEILING REACHED: cancelling the change'); void changes.cancel(userId, task.id).catch(() => undefined); } }); }, 2000) : null;
  const done = await changes.run(userId, task.id).finally(() => { if (guard) clearInterval(guard); });
  if (LIVE_MODEL) { const usd = await spent(); const { data } = await admin.from('ai_usage_ledger').select('model_id,input_tokens,output_tokens,cost_usd').eq('user_id', userId).gte('created_at', startedAt); console.log('MODEL SPEND', JSON.stringify({ usd: Number(usd.toFixed(4)), calls: data?.length ?? 0, models: [...new Set((data ?? []).map((r) => r.model_id))] })); assert.ok(usd <= MAX_USD + 0.05, 'spend exceeded the ceiling by more than one call'); }
  assert.ok(done.result.length > 0 && done.result.every((r) => ['index.html', 'styles.css', 'script.js', 'public/index.html'].includes(r.path)), 'unexpected files: ' + done.result.map((r) => r.path).join(', ') + ' / ' + done.status + ': ' + done.statusReason);
  if (!LIVE_MODEL) assert.deepEqual(done.result.map((r) => r.path).sort(), ['index.html', 'styles.css'], done.status + ': ' + done.statusReason + ' ' + done.events.slice(-4).map((e) => e.message).join(' | '));
  assert.notEqual(done.status, 'verified', 'a static site with no tests and no browser check must not be called verified');
  pass(`change produced exactly index.html and styles.css and ended "${done.status}" (no project tests, no browser check ran)`);

  // 4. deliver as a real review branch and DRAFT pull request, refusing nothing but writing only to the test repo
  const before = JSON.parse(gh('api', `repos/${REPO}/git/ref/heads/${binding.baseBranch}`)).object.sha as string;
  const outcome = await delivery.deliver(userId, done.id, { mode: 'pull_request', allowUnverified: true });
  assert.equal(outcome.status, 'delivered', JSON.stringify(outcome).slice(0, 300));
  const receipt = outcome.receipt;
  const pr = JSON.parse(gh('api', `repos/${REPO}/pulls/${receipt.pullRequestNumber}`));
  assert.equal(pr.draft, true); assert.equal(pr.base.ref, binding.baseBranch); assert.match(pr.head.ref, /^xroga\//);
  const files = (JSON.parse(gh('api', `repos/${REPO}/pulls/${receipt.pullRequestNumber}/files`)) as { filename: string }[]).map((f) => f.filename).sort();
  assert.deepEqual(files, done.result.map((r) => r.path).sort());
  assert.equal(JSON.parse(gh('api', `repos/${REPO}/git/ref/heads/${binding.baseBranch}`)).object.sha, before);
  pass(`real draft pull request #${receipt.pullRequestNumber} on branch ${pr.head.ref} changes only index.html and styles.css; the base branch is untouched`);

  // 5. delivering again is idempotent: no second branch or pull request
  const again = await delivery.deliver(userId, done.id, { mode: 'pull_request', allowUnverified: true });
  assert.equal(again.status, 'delivered'); assert.equal(again.alreadyDelivered, true);
  const open = JSON.parse(gh('api', `repos/${REPO}/pulls?state=open`)) as { number: number }[];
  assert.equal(open.filter((p) => p.number === receipt.pullRequestNumber).length, 1);
  pass('delivering the same change again created no second pull request');

  // 6. clean up what this check created
  gh('pr', 'close', String(receipt.pullRequestNumber), '--repo', REPO, '--delete-branch');
  const left = JSON.parse(gh('api', `repos/${REPO}/pulls?state=open`)) as unknown[];
  assert.equal(left.length, 0);
  await source.unlink(userId, binding.id);
  pass('closed the pull request, deleted its branch and unlinked the repository');

  console.log(`\n${results.length} checks passed against ${REPO}`);
}

main().catch((error) => { console.error('FAIL', error instanceof Error ? error.message : error); process.exitCode = 1; });
