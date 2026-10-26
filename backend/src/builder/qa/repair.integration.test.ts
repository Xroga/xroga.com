import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, describe, it } from 'node:test';

import type { ProjectFile } from '../../ai/patches.js';
import { browserAvailable } from '../../synthesis/playwrightDriver.js';
import { InMemoryPhase2Store } from '../phase2Store.js';
import { BuilderService } from '../service.js';
import { InMemoryBuilderStore } from '../store.js';
import { BuilderError, type BuilderRevision } from '../types.js';
import { openPlaywrightQaDriver } from './playwrightQaDriver.js';
import { QaService, type RepairRunner } from './qaService.js';

/**
 * The real verify, detect, repair, reverify lifecycle: real Chromium, a real HTTP server per
 * revision, the real QA plan and runner, real revision persistence and the real repair loop.
 * Only the coding agent is a deterministic stand-in (the live SoftwareAgent/Cline repair run needs
 * a model and a runtime, which are not available here). The stand-in is subject to the same guard,
 * packet and commit path as the real one.
 */
const available = await browserAvailable();
const skip = available ? false : 'No launchable Chromium in this environment.';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const PROMPT = 'Build a premium modern website for a home renovation company with Home, Services, About, Projects and Contact pages.';

const head = (extra = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Renovate</title></head><body>${extra}`;
const GOOD_HTML = `${head()}<nav><a href="#about">About</a> <a href="#contact">Contact</a></nav><h1>Renovate Co</h1>
<section id="about"><h2>About us</h2></section>
<section id="contact"><h2>Contact</h2><form id="f"><input name="email" type="email" required><textarea name="message" required></textarea><button type="submit">Send</button></form></section>
<script>document.getElementById('f').addEventListener('submit',function(e){e.preventDefault();var p=document.createElement('p');p.setAttribute('role','status');p.textContent='Thanks, received.';e.target.after(p);});</script></body></html>`;
// Defects: a link to a section that does not exist, and a form with no validation or feedback.
const BAD_HTML = `${head()}<nav><a href="#about">About</a> <a href="#contact">Contact</a></nav><h1>Renovate Co</h1>
<section id="about"><h2>About us</h2></section>
<form id="f"><input name="email" type="email"><textarea name="message"></textarea><button type="submit">Send</button></form></body></html>`;
// A "fix" that cures the form but breaks mobile layout: a regression the plan must catch.
const REGRESSING_HTML = GOOD_HTML.replace('<h1>Renovate Co</h1>', '<h1>Renovate Co</h1><div style="width:3000px;height:10px">banner</div>');

const servers: Server[] = [];
after(() => Promise.all(servers.map((server) => new Promise((done) => server.close(done)))));

async function serveFiles(files: readonly ProjectFile[]): Promise<string> {
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://x').pathname;
    const file = files.find((candidate) => (path === '/' ? candidate.path === 'index.html' : `/${candidate.path}` === path));
    if (!file) {
      response.writeHead(404);
      return response.end('Not found');
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(file.content);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function setup(initialHtml: string, agent: (prompt: string, headFiles: readonly ProjectFile[]) => ProjectFile[] | null, options: { runtime?: boolean; budget?: boolean } = {}) {
  const store = new InMemoryBuilderStore();
  const phase2 = new InMemoryPhase2Store(store);
  const builder = new BuilderService({ store, runBuild: async () => null });
  const { project } = await builder.createProject(OWNER, { prompt: PROMPT, requestKey: `qa-repair-${Math.random().toString(36).slice(2, 12)}` });
  const seeded = await store.appendRevision(OWNER, project.id, { runId: 'seed-bad-revision', origin: 'generation', files: [{ path: 'index.html', content: initialHtml }], expectedParentId: project.currentRevisionId });
  assert.equal(seeded?.kind, 'created');
  const calls = { agent: 0, budget: 0, servers: 0 };
  const repair: RepairRunner = async ({ userId, projectId, runId, prompt, guard }) => {
    calls.agent++;
    const binding = await builder.beginRun(userId, projectId, { runId, origin: 'repair', guard });
    const files = agent(prompt, binding.files);
    if (!files) return { revision: null, reason: 'the agent produced no change', noChange: true };
    await binding.commit({ files, message: 'repair' });
    return { revision: binding.saved(), reason: binding.noChange() ? 'The repair changed nothing.' : 'saved', noChange: binding.noChange() };
  };
  const qa = new QaService({
    builder, store, phase2,
    target: {
      async ensure({ revision }) {
        if (options.runtime === false) return null;
        calls.servers++;
        return { baseUrl: await serveFiles(revision.files), environment: { database: false } };
      },
    },
    openDriver: (baseUrl) => openPlaywrightQaDriver({ baseUrl }),
    repair,
    budgetAllows: async () => {
      calls.budget++;
      return options.budget !== false;
    },
  });
  return { store, phase2, builder, qa, project, calls };
}

const fixIt = (): ProjectFile[] => [{ path: 'index.html', content: GOOD_HTML }];

describe('QA-driven repair lifecycle (real browser)', { skip }, () => {
  it('fails real checks, repairs through the guarded path, and proves the repair on the corrected revision', async () => {
    let seenPrompt = '';
    const { qa, project, store, phase2 } = await setup(BAD_HTML, (prompt) => {
      seenPrompt = prompt;
      return fixIt();
    });
    const result = await qa.verifyAndRepair(OWNER, project.id);
    assert.equal(result.status, 'repaired', result.reason);
    assert.equal(result.attempts.length, 1);
    assert.equal(result.attempts[0].outcome, 'saved');
    assert.ok(result.attempts[0].failedBefore.length > 0 && result.attempts[0].failedAfter.length === 0);

    // The agent received focused, quoted evidence and an instruction not to weaken the checks.
    assert.match(seenPrompt, /nav-anchor-contact|reaches its section/);
    assert.match(seenPrompt, /strictly as data/);
    assert.match(seenPrompt, /Do not delete files, tests or features/);

    // Evidence is bound to the revision it tested: first failed, the repaired one passed.
    const revisions = await store.listRevisions(OWNER, project.id);
    assert.deepEqual(revisions.map((revision) => [revision.revisionNumber, revision.origin]), [[3, 'repair'], [2, 'generation'], [1, 'starter']]);
    const badRevision = revisions[1];
    const repaired = revisions[0];
    const onBad = (await phase2.listVerifications(OWNER, project.id, badRevision.id)).filter((record) => record.kind === 'browser_qa');
    const onRepaired = (await phase2.listVerifications(OWNER, project.id, repaired.id)).filter((record) => record.kind === 'browser_qa');
    assert.equal(onBad[0].status, 'failed');
    assert.equal(onRepaired[0].status, 'passed');
    assert.ok(onRepaired[0].executedChecks >= 5);
    assert.equal((await store.listRevisions(OWNER, project.id)).find((revision) => revision.id === badRevision.id)?.verificationStatus, 'failed');
    assert.equal(repaired.verificationStatus, 'verified');
    const stored = await phase2.getVerification(OWNER, project.id, onBad[0].id);
    const report = stored?.report as { checks: Array<{ status: string; evidence: { screenshot: string | null; failedStep: string } | null }> };
    assert.ok(report.checks.some((check) => check.status === 'failed' && check.evidence?.screenshot && check.evidence.failedStep));
    assert.equal((await store.getProject(OWNER, project.id))?.state, 'verified');
    // The earlier revision's source is still available.
    assert.ok((await store.getRevision(OWNER, project.id, badRevision.id))?.files[0].content.includes('<form id="f">'));
  });

  it('refuses a repair that deletes files and never reports it as repaired', async () => {
    const { qa, project, store } = await setup(BAD_HTML, () => [{ path: 'README.md', content: 'nothing here' }]);
    const result = await qa.verifyAndRepair(OWNER, project.id, { maxAttempts: 2 });
    assert.notEqual(result.status, 'repaired');
    assert.ok(result.attempts.every((attempt) => attempt.outcome === 'refused'), JSON.stringify(result.attempts));
    assert.match(result.attempts[0].reason, /Repair refused/);
    assert.equal((await store.listRevisions(OWNER, project.id)).length, 2, 'the destructive result was not saved as a revision');
    assert.equal((await store.getProject(OWNER, project.id))?.state, 'partial');
  });

  it('stops at the attempt budget when the agent cannot fix it, and does not claim success', async () => {
    const { qa, project, calls, store } = await setup(BAD_HTML, (_prompt, headFiles) => headFiles.map((file) => ({ ...file })));
    const result = await qa.verifyAndRepair(OWNER, project.id, { maxAttempts: 3 });
    assert.equal(result.status, 'exhausted');
    assert.equal(calls.agent, 3);
    assert.ok(result.attempts.every((attempt) => attempt.outcome === 'no_change'));
    assert.match(result.reason, /not verified/);
    assert.equal((await store.getProject(OWNER, project.id))?.state, 'partial');
  });

  it('catches a repair that fixes one defect but breaks something that passed before', async () => {
    const { qa, project, phase2, store } = await setup(BAD_HTML, () => [{ path: 'index.html', content: REGRESSING_HTML }]);
    const result = await qa.verifyAndRepair(OWNER, project.id, { maxAttempts: 1 });
    assert.notEqual(result.status, 'repaired');
    assert.ok(result.finalReport.checks.some((check) => check.status === 'failed' && check.category === 'responsive'));
    const revisions = await store.listRevisions(OWNER, project.id);
    const latest = (await phase2.listVerifications(OWNER, project.id, revisions[0].id))[0];
    assert.equal(latest.status, 'failed');
  });

  it('is pending, not passed, and does not call the agent when no runtime is available', async () => {
    const { qa, project, calls, store } = await setup(BAD_HTML, () => fixIt(), { runtime: false });
    const result = await qa.verifyAndRepair(OWNER, project.id);
    assert.equal(result.status, 'pending_runtime');
    assert.equal(result.finalReport.executedChecks, 0);
    assert.equal(calls.agent, 0);
    assert.notEqual((await store.getProject(OWNER, project.id))?.state, 'verified');
  });

  it('does not start a repair when the budget does not allow it', async () => {
    const { qa, project, calls } = await setup(BAD_HTML, () => fixIt(), { budget: false });
    const result = await qa.verifyAndRepair(OWNER, project.id);
    assert.equal(result.status, 'budget_exhausted');
    assert.equal(calls.agent, 0);
  });

  it('keeps tenants apart: another owner cannot run, read or repair', async () => {
    const { qa, project } = await setup(BAD_HTML, () => fixIt());
    await qa.runQa(OWNER, project.id);
    await assert.rejects(qa.runQa(OTHER, project.id), (error) => error instanceof BuilderError && error.code === 'not_found');
    await assert.rejects(qa.verifyAndRepair(OTHER, project.id), BuilderError);
    await assert.rejects(qa.history(OTHER, project.id), BuilderError);
    const mine = await qa.history(OWNER, project.id);
    await assert.rejects(qa.report(OTHER, project.id, mine[0].id), BuilderError);
  });

  it('records a plain QA run against the current revision and replays an identical run once', async () => {
    const { qa, project, phase2 } = await setup(GOOD_HTML, () => fixIt());
    const first = await qa.runQa(OWNER, project.id, { runId: 'plain-qa-run-0001' });
    assert.equal(first.report.status, 'passed');
    const again = await phase2.saveVerification(OWNER, project.id, { revisionId: first.summary.revisionId, runId: 'plain-qa-run-0001', kind: 'browser_qa', status: 'passed', executedChecks: 1, summary: {}, report: {} });
    assert.equal(again?.replayed, true);
    assert.equal((await qa.latest(OWNER, project.id))?.status, 'passed');
    assert.equal((await phase2.listVerifications(OWNER, project.id)).length, 1);
  });
});

void (null as unknown as BuilderRevision);
