import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildSandboxCommand,
  collectorSource,
  extractAppLog,
  parseCollectorOutput,
  type InSandboxBrowserRequest,
} from './inSandboxBrowser.js';

/**
 * The collector and the command are generated as *strings*, which makes them uniquely easy to
 * break in ways nothing catches. A stray backtick terminates the template literal (that one at
 * least fails compilation); a stray `${…}` silently interpolates and ships a collector missing
 * whatever it swallowed. These assert on the generated text as a program, not as a blob.
 */

const request = (over: Partial<InSandboxBrowserRequest> = {}): InSandboxBrowserRequest => ({
  startScript: 'dev',
  domExpectations: [],
  interactions: [],
  totalTimeoutMs: 60_000,
  serverTimeoutMs: 20_000,
  install: false,
  ...over,
});

test('the generated collector is syntactically valid JavaScript', () => {
  // `node --check` is the only judge that matters here: it is the same parser that will run it
  // inside the sandbox. A template-literal accident produces text that looks fine in review and
  // dies on the first real execution, reported as "the application did not start".
  const dir = mkdtempSync(join(tmpdir(), 'collector-'));
  try {
    const file = join(dir, 'collect.mjs');
    writeFileSync(file, collectorSource(request()));
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the generated shell command is syntactically valid shell', () => {
  const { command, args } = buildSandboxCommand(request());
  assert.equal(command, '/bin/sh');
  execFileSync('/bin/sh', ['-n', '-c', args[1]!], { stdio: 'pipe' });
});

test('acceptance checks survive into the collector rather than being swallowed', () => {
  const source = collectorSource(request({
    domExpectations: [{ description: 'heading', text: 'Create project' }],
    interactions: [{ description: 'click', clickSelector: '#add', expectText: 'Added' }],
  }));
  assert.match(source, /Create project/);
  assert.match(source, /#add/);
  // The tell-tale of an interpolation accident: an unresolved placeholder shipping verbatim.
  assert.equal(/\$\{[a-zA-Z]/.test(source), false, 'an unsubstituted template placeholder shipped');
});

test('the collector searches global module roots, not only the local tree', () => {
  // The official Playwright image installs the package globally, which a bare specifier cannot
  // reach. Without this the collector reports `browser_unavailable` inside the very image
  // provisioned to give it a browser.
  const source = collectorSource(request());
  assert.match(source, /\/usr\/lib\/node_modules/);
  assert.match(source, /createRequire/);
});

test('cleanup keys on the pid the child reports, never on $!', () => {
  // `setsid` forks when it is already a process group leader, so `$!` can name a process whose
  // group no longer exists — `kill -$!` then kills nothing and the dev server outlives the run.
  const script = buildSandboxCommand(request()).args[1]!;
  assert.match(script, /trap cleanup EXIT INT TERM HUP/);
  assert.match(script, /PID_FILE/);
  assert.equal(/APP_PID=\$!/.test(script), false, 'cleanup went back to keying on $!');
});

test('the start script travels in the environment, never interpolated into the script', () => {
  // `sh -c SCRIPT arg` makes `arg` `$0`, not `$1`. Passing it positionally is how the serve
  // script once ran as an empty name; interpolating it would be an injection.
  const { args } = buildSandboxCommand(request({ startScript: 'dev; rm -rf /' }));
  assert.equal(args.length, 2, 'the start script must not be passed positionally');
  assert.equal(args[1]!.includes('rm -rf /'), false, 'the start script was interpolated');
  assert.match(args[1]!, /XROGA_START_SCRIPT/);
});

test('log and pid paths are per-run, so a stale file cannot be read as this run', () => {
  const script = buildSandboxCommand(request()).args[1]!;
  assert.match(script, /APP_LOG=\/tmp\/xroga_app_\$\$\.log/);
  assert.match(script, /PID_FILE=\/tmp\/xroga_app_\$\$\.pid/);
});

test('install is skipped when the caller says there is nothing to install', () => {
  assert.equal(buildSandboxCommand(request({ install: false })).args[1]!.includes('npm install'), false);
  assert.match(buildSandboxCommand(request({ install: true })).args[1]!, /npm install/);
});

test('no result at all is distinguished from a result reporting failure', () => {
  // Blaming generated code for our own harness producing nothing would misattribute the defect.
  assert.equal(parseCollectorOutput('build noise only'), null);
  const payload = parseCollectorOutput(
    'noise\n<<<XROGA_BROWSER_RESULT{"ok":true,"url":"http://127.0.0.1:3000/"}XROGA_BROWSER_RESULT>>>\n',
  );
  assert.equal(payload?.ok, true);
  assert.equal(payload?.url, 'http://127.0.0.1:3000/');
});

test('the last result wins when a command prints more than one', () => {
  const payload = parseCollectorOutput(
    '<<<XROGA_BROWSER_RESULT{"ok":false}XROGA_BROWSER_RESULT>>>' +
      '<<<XROGA_BROWSER_RESULT{"ok":true}XROGA_BROWSER_RESULT>>>',
  );
  assert.equal(payload?.ok, true);
});

test('the application log is extracted and bounded', () => {
  const log = extractAppLog(`result\n---XROGA_APP_LOG---\n${'x'.repeat(9_000)}`);
  assert.ok(log.length <= 4_000);
  assert.equal(extractAppLog('no marker here'), '');
});
