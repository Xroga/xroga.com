import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, describe, it } from 'node:test';

import type { ProjectFile } from '../ai/patches.js';
import { planLivePreview } from '../synthesis/livePreview/plan.js';
import type { SoftwareProject } from '../synthesis/softwareProject.js';
import { verifyAppReadiness, type RuntimeExec } from './readiness.js';
import { deriveBuildSpec } from './spec.js';
import { materializeStarter, selectStarter } from './starters.js';

/**
 * Runs the real readiness probe (a node script) against a real local HTTP server. The server is
 * a test fixture standing in for a generated application; the probe, parsing and verdict are the
 * production code. Executes locally, with no provider, network egress or credentials.
 */
const localExec: RuntimeExec = (command) =>
  new Promise((resolve) => {
    const child = spawn(command.command, [...command.args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), command.timeoutMs);
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code, stdout, stderr, timedOut: false });
    });
  });

const servers: Server[] = [];
after(() => Promise.all(servers.map((server) => new Promise((done) => server.close(done)))));

async function serve(handler: Parameters<typeof createServer>[1]): Promise<number> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '::1', resolve));
  return (server.address() as AddressInfo).port;
}

const files: ProjectFile[] = [
  { path: 'app/page.tsx', content: '' },
  { path: 'app/about/page.tsx', content: '' },
];

describe('strict readiness against a real HTTP server', () => {
  it('passes when every route answers 200 with a real page', async () => {
    const port = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><body><h1>Renovation Co</h1></body></html>');
    });
    const report = await verifyAppReadiness({ exec: localExec, files, port });
    assert.equal(report.ready, true, report.reason);
    assert.equal(report.routes.length, 2);
  });

  it('fails a server that is alive but serves a 404 for a defined route', async () => {
    const port = await serve((req, res) => {
      if (req.url === '/about') {
        res.writeHead(404);
        return res.end('Not Found');
      }
      res.writeHead(200);
      res.end('<html>home</html>');
    });
    const report = await verifyAppReadiness({ exec: localExec, files, port });
    assert.equal(report.ready, false);
    assert.match(report.reason, /\/about/);
    assert.match(report.reason, /404/);
  });

  it('fails a page that renders a framework error with a 200 status', async () => {
    const port = await serve((_req, res) => {
      res.writeHead(200);
      res.end('<html><body>Unhandled Runtime Error: x is not defined</body></html>');
    });
    const report = await verifyAppReadiness({ exec: localExec, files, port });
    assert.equal(report.ready, false);
    assert.match(report.reason, /error/);
  });

  it('fails an empty body and a closed port', async () => {
    const emptyPort = await serve((_req, res) => {
      res.writeHead(200);
      res.end();
    });
    assert.equal((await verifyAppReadiness({ exec: localExec, files, port: emptyPort })).ready, false);
    const closed = await serve((_req, res) => res.end('x'));
    await new Promise((done) => servers.pop()!.close(done));
    assert.equal((await verifyAppReadiness({ exec: localExec, files, port: closed })).ready, false);
  });
});

describe('starters are runnable by the existing live-preview planner', () => {
  function planFor(prompt: string) {
    const { spec } = deriveBuildSpec(prompt);
    const seed = materializeStarter(selectStarter(spec), { prompt, title: spec.title });
    const project = { workspace: { files: seed.files }, recipe: { previewStrategy: 'browser' } } as unknown as SoftwareProject;
    return { seed, plan: planLivePreview(project) };
  }

  it('the static website starter yields a dependency-free browser server with a probe', () => {
    const { plan, seed } = planFor('Build a premium modern website for a home renovation company with Home, Services, About, Projects and Contact pages.');
    assert.ok(plan.process, plan.message);
    assert.equal(plan.process?.port, 3000);
    assert.ok(plan.process?.probeCommand);
    assert.ok(seed.files.some((file) => file.path === 'index.html' && file.content.length > 500));
  });

  it('the Next.js starter yields a dev-server plan and a valid manifest', () => {
    const { plan, seed } = planFor('Build a task-management application with user accounts, dashboard, task creation, editing, completion, deletion, and saved data that remains after a refresh.');
    assert.ok(plan.process, plan.message);
    assert.equal(plan.process?.port, 3000);
    const manifest = JSON.parse(seed.files.find((file) => file.path === 'package.json')!.content) as { scripts?: Record<string, string>; dependencies?: Record<string, string> };
    assert.ok(manifest.scripts?.dev && manifest.scripts?.build);
    assert.ok(manifest.dependencies?.next);
    assert.ok(!seed.files.some((file) => /(^|\/)\.env$/.test(file.path)), 'no env file with values is seeded');
  });
});
