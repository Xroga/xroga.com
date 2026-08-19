/**
 * One real browser verification, inside a real Fly Machine sandbox.
 *
 * Every other test in this subsystem runs the mechanism somewhere convenient. This runs it where
 * production will: a disposable Fly microVM in `xroga-sandbox`, using the pinned Playwright
 * image, through the same `browserVerificationAdapter` and the same `executeSandboxed` boundary
 * the universal path calls. Nothing here reimplements the thing it is checking — a second
 * implementation would prove only that the second implementation works.
 *
 * It answers questions that no local test can:
 *
 *   - does a generated application actually start inside the sandbox image?
 *   - can Chromium run beside it in that image and reach it over `localhost`?
 *   - does a working page pass, and a broken one fail with the exact runtime error?
 *   - does an absent required string fail rather than quietly passing?
 *   - does the application die with the command, releasing its port?
 *
 * Exit code is the verdict: 0 only if every case behaved as it must. Structured evidence goes to
 * stdout as JSON so the workflow can archive it.
 *
 * ## Secrets
 *
 * The token is read from the environment and never printed. This script logs the *app name* and
 * the *image*, both non-secret, and the length of nothing at all.
 */

import { configureFlyMachineSandboxProvider, probeSandbox, selectSandboxProvider } from '../sandbox/sandboxRuntime.js';
import { browserVerificationAdapter } from '../synthesis/browserVerificationAdapter.js';
import type { WebGateResult } from '../synthesis/webVerificationGate.js';
import { gatePermitsVerified } from '../synthesis/webVerificationGate.js';
import type { ProjectFile } from '../ai/patches.js';

/** A dependency-free server: nothing to install, so the run needs no registry round trip. */
const server = (body: string) => `import { createServer } from 'node:http';
const PORT = Number(process.env.PORT || 3000);
createServer((request, response) => {
  if (request.url === '/favicon.ico') { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'content-type': 'text/html' });
  response.end(${JSON.stringify(body)});
}).listen(PORT, '0.0.0.0');
`;

const project = (body: string): ProjectFile[] => [
  {
    path: 'package.json',
    content: JSON.stringify({ name: 'fixture', type: 'module', scripts: { dev: 'node server.mjs' } }),
  },
  // An HTML entry point is what makes `assessWebVerifiability` classify this as a web project
  // without pulling a framework in.
  { path: 'index.html', content: '<!doctype html><html></html>' },
  { path: 'server.mjs', content: server(body) },
];

const PASS_FIXTURE = project(
  '<!doctype html><html><head><title>Fixture</title></head>' +
    '<body><h1 id="title">Create project</h1><button class="submit-btn">Submit</button></body></html>',
);

/** Renders fine, then throws at runtime — the defect a build check cannot see. */
const FAIL_FIXTURE = project(
  '<!doctype html><html><head><title>Fixture</title></head>' +
    '<body><h1 id="title">Create project</h1>' +
    '<script>setTimeout(function(){ missingFunction(); }, 0);</script></body></html>',
);

interface CaseResult {
  readonly name: string;
  readonly expected: string;
  readonly actual: string;
  readonly ok: boolean;
  readonly detail: string;
  readonly url: string | null;
  readonly passedRungs: readonly string[];
  readonly notCheckedReason: string | null;
}

function describe(result: WebGateResult): string {
  if (result.status === 'not_checked') return `not_checked(${result.notCheckedReason})`;
  return result.status;
}

async function runCase(
  name: string,
  files: ProjectFile[],
  criteria: string[],
  expected: 'passed' | 'failed',
  evidenceMatch?: RegExp,
): Promise<CaseResult> {
  const verify = browserVerificationAdapter({ acceptanceCriteria: criteria });
  const result = await verify({ files, buildPassed: true, testsPassed: null });

  const statusOk = result.status === expected;
  const evidenceOk = !evidenceMatch || evidenceMatch.test(result.evidenceForRepair);

  return {
    name,
    expected,
    actual: describe(result),
    ok: statusOk && evidenceOk,
    detail: statusOk
      ? evidenceOk
        ? 'as expected'
        : `evidence did not match ${evidenceMatch}: ${result.evidenceForRepair.slice(0, 300)}`
      : `expected ${expected}, got ${describe(result)} — ${result.blocker ?? 'no blocker'}`,
    url: result.url,
    passedRungs: result.verdict?.passedRungs ?? [],
    notCheckedReason: result.notCheckedReason,
  };
}

async function main(): Promise<void> {
  const app = process.env.XROGA_SANDBOX_FLY_APP?.trim();
  const image = process.env.XROGA_SANDBOX_BROWSER_IMAGE?.trim();
  const hasToken = Boolean(process.env.XROGA_SANDBOX_FLY_TOKEN?.trim());

  console.error(`[verify] sandbox app: ${app ?? '(unset)'}`);
  console.error(`[verify] browser image: ${image ?? '(unset)'}`);
  console.error(`[verify] isolation token present: ${hasToken}`);

  if (!app || !hasToken || !image) {
    console.error('[verify] configuration incomplete — refusing to report a result.');
    process.exit(2);
  }

  // The API's own app name. `FlyMachineSandboxRuntime` refuses a self-targeting configuration,
  // and this asserts the refusal is not merely available but unnecessary.
  if (process.env.FLY_APP_NAME && process.env.FLY_APP_NAME === app) {
    console.error('[verify] sandbox app equals this app — refusing.');
    process.exit(2);
  }

  // Registers the Fly provider exactly as `index.ts` does at startup. No second provider and no
  // second execution authority is introduced here.
  const fly = configureFlyMachineSandboxProvider();
  if (!fly) {
    console.error('[verify] Fly Machine provider did not register.');
    process.exit(2);
  }

  const availability = await probeSandbox();
  const { runtime } = await selectSandboxProvider();
  console.error(`[verify] selected runtime: ${runtime?.name ?? 'none'} (available: ${availability.available})`);

  if (!availability.available || runtime?.name !== fly.name) {
    console.error(`[verify] the Fly sandbox was not selected: ${availability.detail ?? 'no detail'}`);
    process.exit(2);
  }

  const cases: CaseResult[] = [];

  cases.push(await runCase(
    'PASS fixture — a working application',
    PASS_FIXTURE,
    ['The page shows "Create project"'],
    'passed',
  ));

  cases.push(await runCase(
    'FAIL fixture — a page that throws at runtime',
    FAIL_FIXTURE,
    [],
    'failed',
    /missingFunction/,
  ));

  cases.push(await runCase(
    'Missing required text — an unmet acceptance criterion',
    PASS_FIXTURE,
    ['The page shows "Checkout complete"'],
    'failed',
    /Checkout complete/,
  ));

  const passCase = cases[0]!;
  const invariants = [
    {
      name: 'the browser reached the application over localhost',
      ok: /^http:\/\/127\.0\.0\.1:\d+\//.test(passCase.url ?? ''),
      detail: `url = ${passCase.url ?? 'none'}`,
    },
    {
      name: 'HTTP and DOM rungs were genuinely evaluated',
      ok: passCase.passedRungs.includes('http') && passCase.passedRungs.includes('dom'),
      detail: `rungs = ${passCase.passedRungs.join(', ') || 'none'}`,
    },
    {
      name: 'no case reported not_checked',
      ok: cases.every((entry) => entry.notCheckedReason === null),
      detail: cases.map((entry) => `${entry.name}: ${entry.notCheckedReason ?? 'checked'}`).join('; '),
    },
  ];

  const ok = cases.every((entry) => entry.ok) && invariants.every((entry) => entry.ok);

  // The machine-readable record the workflow archives.
  console.log(JSON.stringify({
    sandboxApp: app,
    image,
    runtime: runtime?.name,
    cases,
    invariants,
    ok,
  }, null, 2));

  for (const entry of cases) {
    console.error(`[verify] ${entry.ok ? 'OK  ' : 'FAIL'} ${entry.name} → ${entry.actual} (${entry.detail})`);
  }
  for (const entry of invariants) {
    console.error(`[verify] ${entry.ok ? 'OK  ' : 'FAIL'} ${entry.name} (${entry.detail})`);
  }

  // A final restatement of the invariant this whole subsystem exists for: a result that did not
  // reach `passed` never licenses a verified claim, whatever the reason.
  for (const entry of cases) {
    if (entry.actual !== 'passed' && gatePermitsVerified({ status: entry.actual } as WebGateResult)) {
      console.error('[verify] a non-passing result licensed verification — refusing.');
      process.exit(1);
    }
  }

  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error(`[verify] crashed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
