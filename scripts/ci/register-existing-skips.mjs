import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { discoverSkips } from './check-test-skips.mjs';
import { root } from './toolchain.mjs';

// One-time, manually reviewed registration. Never called by CI or run-baseline.
const inspectedBase = 'c7230c815870ad3942f5f74ddf70c9ddff2ec988';
const reasons = {
  'backend/src/ai/compileCommand.test.ts': 'Existing test executes the production Linux /bin/sh sandbox command; Windows cannot execute /bin/sh. Linux baseline CI must run it.',
  'backend/src/synthesis/inSandboxBrowser.test.ts': 'Existing shell syntax assertion requires /bin/sh; Windows limitation only. Linux baseline CI must run it.',
  'backend/src/synthesis/inSandboxBrowser.integration.test.ts': 'Existing local sandbox/browser integration requires Linux /bin/sh and installed Chromium. CI must execute it using one matching browser cache; Windows cannot exercise this boundary.',
  'backend/src/synthesis/playwrightDriver.integration.test.ts': 'Existing real-browser test is conditional on installed Chromium. Baseline CI installs pinned Playwright Chromium; missing browser is a reported gap, not passing browser coverage.',
  'backend/src/organicIntelligence/content/engine.test.ts': 'Existing symlink/junction negative test may lack permission on Windows (EPERM); it must execute on the Linux CI host.',
};
const findings = discoverSkips();
for (const finding of findings) {
  if (finding.kind !== 'SKIPPED' || !reasons[finding.path]) throw new Error(`Unreviewed/focused test cannot be registered: ${finding.path}:${finding.line}`);
  const original = execFileSync('git', ['show', `${inspectedBase}:${finding.path}`], { cwd: root, encoding: 'utf8' }).replace(/\r\n/g, '\n');
  const current = readFileSync(join(root, finding.path), 'utf8').replace(/\r\n/g, '\n');
  if (original !== current) throw new Error(`Test changed after the inspected baseline; manual review required: ${finding.path}`);
}
const output = join(root, 'tests/ci/known-skips.json');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify({ version: '1.0', inspected_source_sha: inspectedBase, entries: findings.map(finding => ({
  id: finding.id, path: finding.path, title: finding.title, condition: finding.condition, owner: 'Xroga engineering',
  reason: reasons[finding.path], issue_or_command: 'XB01-C003 platform/browser baseline', review_date: '2026-11-13',
})) }, null, 2)}\n`);
console.log(JSON.stringify({ registeredPreExistingSkips: findings.length, newRuntimeSkipsAdded: 0 }));
