import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkImagePins, type PinProblem } from './imagePins.js';

const repo = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const dir = join(repo, 'deploy/browser-worker');
const json = (f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const text = (f: string) => readFileSync(join(dir, f), 'utf8');
const probeSources = Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith('.mjs')).map((f) => [f, text(f)]));
const real = () => ({ pkg: json('package.json'), lock: json('package-lock.json'), dockerfile: text('Dockerfile'), proxyDockerfile: text('Dockerfile.proxy'), probeSources: { ...probeSources } });
const codes = (mut: (i: ReturnType<typeof real>) => void): string[] => { const i = real(); mut(i); return [...new Set(checkImagePins(i).map((p: PinProblem) => p.code))]; };

describe('browser worker image pins', () => {
  it('the committed pins are exact, locked, integrity checked, licence checked, and Stagehand is wired only locally in the job runtime', () => {
    assert.deepEqual(checkImagePins(real()), []);
    const i = real();
    assert.equal(i.pkg.dependencies['playwright-core'], '1.62.0');
    assert.equal(i.pkg.dependencies['@browserbasehq/stagehand'], '4.2.0');
    assert.match(i.dockerfile, /playwright:v1\.62\.0-noble@sha256:[0-9a-f]{64}/);
  });

  it('refuses a version range, however small', () => {
    for (const range of ['^4.2.0', '~4.2.0', '>=4.2.0', 'latest', '4.2', '4.x', '*', '4.2.0-beta.1']) {
      assert.ok(codes((i) => { i.pkg.dependencies['@browserbasehq/stagehand'] = range; }).includes('EXACT_VERSION'), range);
    }
  });

  it('refuses a lockfile that is out of step with package.json', () => {
    assert.ok(codes((i) => { i.pkg.dependencies['playwright-core'] = '1.62.1'; }).includes('LOCK_OUT_OF_SYNC'));
    assert.ok(codes((i) => { i.lock.packages['node_modules/playwright-core'].version = '1.61.0'; }).includes('LOCK_VERSION'));
    assert.ok(codes((i) => { delete i.pkg.dependencies['@browserbasehq/stagehand']; }).includes('LOCK_OUT_OF_SYNC'));
  });

  it('refuses a locked package with no integrity hash, a weak hash, or a source that is not the npm registry', () => {
    const some = (i: ReturnType<typeof real>) => i.lock.packages['node_modules/zod'];
    assert.ok(codes((i) => { delete some(i).integrity; }).includes('LOCK_INTEGRITY'));
    assert.ok(codes((i) => { some(i).integrity = 'sha1-abcdef'; }).includes('LOCK_INTEGRITY'));
    assert.ok(codes((i) => { some(i).resolved = 'https://evil.example.com/zod-4.4.3.tgz'; }).includes('LOCK_SOURCE'));
    assert.ok(codes((i) => { some(i).resolved = 'git+ssh://git@github.com/x/zod.git#abc'; }).includes('LOCK_SOURCE'));
    assert.ok(codes((i) => { delete some(i).resolved; }).includes('LOCK_SOURCE'));
  });

  it('refuses a dependency with an unlisted licence or none, and one that runs code at install time', () => {
    for (const licence of ['GPL-3.0', 'AGPL-3.0-only', 'UNLICENSED', 'SEE LICENSE IN LICENSE.md']) {
      assert.ok(codes((i) => { i.lock.packages['node_modules/zod'].license = licence; }).includes('LICENSE'), licence);
    }
    assert.ok(codes((i) => { delete i.lock.packages['node_modules/zod'].license; }).includes('LICENSE'));
    assert.ok(codes((i) => { i.lock.packages['node_modules/zod'].hasInstallScript = true; }).includes('INSTALL_SCRIPT'));
  });

  it('refuses an unpinned or mismatched base image', () => {
    assert.ok(codes((i) => { i.dockerfile = i.dockerfile.replace(/@sha256:[0-9a-f]{64}/, ''); }).includes('BASE_IMAGE'));
    assert.ok(codes((i) => { i.dockerfile = i.dockerfile.replace('playwright:v1.62.0-noble', 'playwright:latest'); }).includes('BASE_IMAGE'));
    assert.ok(codes((i) => { i.dockerfile = i.dockerfile.replace('playwright:v1.62.0-noble', 'playwright:v1.61.0-noble'); }).includes('BASE_TAG_MISMATCH'));
    assert.ok(codes((i) => { i.proxyDockerfile = i.proxyDockerfile.replace(/@sha256:[0-9a-f]{64}/, ''); }).includes('BASE_IMAGE'));
  });

  it('refuses installing dependencies in a way that runs install scripts', () => {
    assert.ok(codes((i) => { i.dockerfile = i.dockerfile.replace(' --ignore-scripts', ''); }).includes('NPM_CI_FLAGS'));
    assert.ok(codes((i) => { i.dockerfile = i.dockerfile.replace('npm ci', 'npm install'); }).includes('NPM_CI_FLAGS'));
  });

  it('refuses wiring Stagehand into the probe: that is INFRA-007', () => {
    assert.ok(codes((i) => { i.probeSources['sandboxProbe.mjs'] += "\nimport { Stagehand } from '@browserbasehq/stagehand';"; }).includes('STAGEHAND_WIRED'));
  });

  it('allows Stagehand only in the job runtime, attached locally, with no hosted launcher, no own launch and no API key or URL', () => {
    const rt = (edit: (t: string) => string) => codes((i) => { i.probeSources['runJob.mjs'] = edit(i.probeSources['runJob.mjs']!); });
    assert.deepEqual(rt((t) => t), []);
    assert.ok(rt((t) => t.replace('localBrowser.connect(', 'localBrowser.launch(')).includes('STAGEHAND_WIRED'));
    assert.ok(rt((t) => `${t}\nconst b = await browserbase.launch({});`).includes('STAGEHAND_WIRED'));
    assert.ok(rt((t) => t.replace('selfHeal: false,', 'selfHeal: false, apiKey: process.env.X,')).includes('STAGEHAND_WIRED'));
    assert.ok(rt((t) => t.replace('selfHeal: false,', "selfHeal: false, apiUrl: 'https://example.com',")).includes('STAGEHAND_WIRED'));
    assert.ok(codes((i) => { i.probeSources['other.mjs'] = "import { Stagehand } from '@browserbasehq/stagehand';"; }).includes('STAGEHAND_WIRED'));
  });

  it('backend source does not import Stagehand or the hosted Browserbase SDK either', () => {
    const files = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(d, e.name)) : e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') ? [join(d, e.name)] : []));
    const hits = files(join(repo, 'backend/src')).filter((f) => /from ['"]@browserbasehq\//.test(readFileSync(f, 'utf8')));
    assert.deepEqual(hits, []);
  });
});
