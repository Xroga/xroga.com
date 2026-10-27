import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ProjectFile } from '../../ai/patches.js';
import { packageBuildZip } from '../../services/scaffolds/packageBuildZip.js';
import { deriveBuildSpec } from '../spec.js';
import { hashSnapshot } from '../snapshot.js';
import { materializeStarter, selectStarter } from '../starters.js';
import type { BuilderRevision, StarterProvenance } from '../types.js';
import { EXPORT_MANIFEST_PATH, EXPORT_SETUP_PATH, buildSourceArchive, classifyExportPath, readZip, setupInstructions, verifyArchive } from './archive.js';

const SITE = 'Build a premium modern website for a home renovation company with Home, Services, About, Projects and Contact pages.';
const SAAS = 'Build a task-management application with user accounts, dashboard, task creation, editing, completion, deletion, and saved data that remains after a refresh.';

function revisionOf(files: ProjectFile[], over: Partial<BuilderRevision> = {}): BuilderRevision {
  return {
    id: '33333333-3333-4333-8333-333333333333', projectId: '44444444-4444-4444-8444-444444444444', userId: '11111111-1111-4111-8111-111111111111', revisionNumber: 4,
    parentRevisionId: null, runId: 'run-0000001', origin: 'generation', contentSha256: hashSnapshot(files), fileCount: files.length, totalBytes: 1, files,
    changeSummary: { created: [], modified: [], deleted: [] }, verificationStatus: 'verified', createdAt: '2026-10-26T00:00:00Z', ...over,
  };
}

function starterFor(prompt: string): { files: ProjectFile[]; starter: StarterProvenance } {
  const { spec } = deriveBuildSpec(prompt);
  const seed = materializeStarter(selectStarter(spec), { prompt, title: spec.title });
  return { files: seed.files, starter: seed.provenance };
}

const build = (files: ProjectFile[], starter: StarterProvenance, revision = revisionOf(files)) => buildSourceArchive({ projectId: revision.projectId, title: 'Renovate Co', revision, starter });

describe('source export', () => {
  it('exports a static site with a manifest, setup instructions and verified per-file hashes', () => {
    const { files, starter } = starterFor(SITE);
    const archive = build(files, starter);
    const entries = readZip(archive.buffer);
    const paths = entries.map((entry) => entry.path);
    assert.ok(paths.includes('index.html'));
    assert.ok(paths.includes(EXPORT_MANIFEST_PATH));
    assert.ok(paths.includes(EXPORT_SETUP_PATH));
    assert.ok(entries.every((entry) => entry.crcValid));
    assert.equal(archive.manifest.revisionNumber, 4);
    assert.equal(archive.manifest.files.length, files.length);
    assert.match(archive.filename, /^renovate-co-r4\.zip$/);
    assert.equal(verifyArchive(archive.buffer, revisionOf(files)).ok, true);
  });

  it('exports a Next.js project with the dependency manifest and real setup commands', () => {
    const { files, starter } = starterFor(SAAS);
    const archive = build(files, starter);
    const setup = readZip(archive.buffer).find((entry) => entry.path === EXPORT_SETUP_PATH)!.data.toString('utf8');
    assert.match(setup, /npm install/);
    assert.match(setup, /npm run dev/);
    assert.match(setup, /Next\.js/);
    assert.ok(readZip(archive.buffer).some((entry) => entry.path === 'package.json'));
    assert.match(setup, /\.env\.local/);
  });

  it('lists only environment variable NAMES in the setup, never values', () => {
    const setup = setupInstructions([{ path: 'package.json', content: '{"scripts":{"dev":"next dev"},"dependencies":{"next":"15.0.0"}}' }, { path: '.env.example', content: 'NEXT_PUBLIC_SUPABASE_URL=\nSUPABASE_SERVICE_ROLE_KEY=secret-value-should-not-appear\n' }], 'T');
    assert.match(setup, /`NEXT_PUBLIC_SUPABASE_URL`/);
    assert.match(setup, /`SUPABASE_SERVICE_ROLE_KEY`/);
    assert.doesNotMatch(setup, /secret-value-should-not-appear/);
    assert.match(setup, /service-role key in client-side code/);
  });

  it('excludes disposable build output and caches, and lists what it excluded and why', () => {
    const files: ProjectFile[] = [
      { path: 'index.html', content: '<h1>x</h1>' },
      { path: 'node_modules/left-pad/index.js', content: 'module.exports=1' },
      { path: '.next/cache/a.js', content: 'x' },
      { path: 'dist/bundle.js', content: 'x' },
      { path: 'debug.log', content: 'x' },
      { path: '.env.example', content: 'API_URL=\n' },
    ];
    const archive = build(files, starterFor(SITE).starter);
    const paths = readZip(archive.buffer).map((entry) => entry.path);
    assert.ok(paths.includes('index.html') && paths.includes('.env.example'));
    for (const excluded of ['node_modules/left-pad/index.js', '.next/cache/a.js', 'dist/bundle.js', 'debug.log']) assert.ok(!paths.includes(excluded), excluded);
    assert.deepEqual(archive.manifest.excluded.map((item) => item.path).sort(), ['.next/cache/a.js', 'debug.log', 'dist/bundle.js', 'node_modules/left-pad/index.js']);
    assert.ok(archive.manifest.excluded.every((item) => item.reason === 'build_output_or_cache'));
    assert.equal(classifyExportPath('.env'), 'credential_file');
    assert.equal(classifyExportPath('.env.example'), null);
  });

  it('refuses to export a revision that contains credentials', () => {
    const { starter } = starterFor(SITE);
    assert.throws(() => build([{ path: 'index.html', content: 'x' }, { path: '.env', content: 'KEY=value' }], starter), /credential/);
    assert.throws(() => build([{ path: 'src/a.ts', content: `const k = '${'ghp_'}${'x'.repeat(36)}'` }], starter), /credential/);
  });

  it('is deterministic: the same revision always yields the same archive bytes', () => {
    const { files, starter } = starterFor(SITE);
    assert.equal(build(files, starter).sha256, build(files, starter).sha256);
    const changed = files.map((file) => (file.path === 'index.html' ? { ...file, content: `${file.content}<!-- edit -->` } : file));
    assert.notEqual(build(changed, starter).sha256, build(files, starter).sha256);
  });

  it('does not let a project file collide with the reserved export files', () => {
    const { starter } = starterFor(SITE);
    assert.throws(() => build([{ path: 'index.html', content: 'x' }, { path: EXPORT_MANIFEST_PATH, content: '{}' }], starter), /reserved/);
  });
});

describe('archive verification', () => {
  const { files, starter } = starterFor(SITE);
  const revision = revisionOf(files);
  const good = () => build(files, starter, revision).buffer;

  it('detects tampered bytes', () => {
    const buffer = Buffer.from(good());
    buffer[60] = buffer[60] ^ 0xff;
    assert.equal(verifyArchive(buffer, revision).ok, false);
  });

  it('detects a manifest that names a different revision or hash', () => {
    const other = revisionOf(files, { id: '55555555-5555-4555-8555-555555555555' });
    const verdict = verifyArchive(good(), other);
    assert.equal(verdict.ok, false);
    assert.ok(verdict.problems.some((problem) => /different revision/.test(problem)));
    assert.equal(verifyArchive(good(), revisionOf(files, { contentSha256: 'a'.repeat(64) })).ok, false);
  });

  it('detects a missing file and an unexpected extra file', () => {
    const entries = readZip(good());
    const without = packageBuildZip(entries.filter((entry) => entry.path !== 'index.html').map((entry) => ({ path: entry.path, content: entry.data.toString('utf8') })), { include: () => true });
    assert.ok(verifyArchive(without, revision).problems.some((problem) => /missing/.test(problem)));
    const extra = packageBuildZip([...entries.map((entry) => ({ path: entry.path, content: entry.data.toString('utf8') })), { path: 'surprise.txt', content: 'x' }], { include: () => true });
    assert.ok(verifyArchive(extra, revision).problems.some((problem) => /Unexpected file/.test(problem)));
  });

  it('detects changed file content and a smuggled credential file', () => {
    const entries = readZip(good()).map((entry) => ({ path: entry.path, content: entry.data.toString('utf8') }));
    const changed = packageBuildZip(entries.map((entry) => (entry.path === 'index.html' ? { ...entry, content: `${entry.content}!` } : entry)), { include: () => true });
    assert.ok(verifyArchive(changed, revision).problems.some((problem) => /hash does not match|differs/.test(problem)));
    const smuggled = packageBuildZip([...entries, { path: '.env', content: 'SECRET=1' }], { include: () => true });
    assert.ok(verifyArchive(smuggled, revision).problems.some((problem) => /credential/.test(problem)));
  });

  it('rejects a ZIP with a path-traversal entry and garbage input', () => {
    const slip = packageBuildZip([{ path: '../evil.txt', content: 'x' }], { include: () => true });
    assert.equal(verifyArchive(slip, revision).ok, false);
    assert.equal(verifyArchive(Buffer.from('not a zip at all'), revision).ok, false);
    assert.equal(verifyArchive(Buffer.alloc(0), revision).ok, false);
  });

  it('a revision file that is neither exported nor listed as excluded fails completeness', () => {
    const bigger = revisionOf([...files, { path: 'extra/file.txt', content: 'added to the revision after export' }]);
    assert.ok(verifyArchive(good(), bigger).problems.some((problem) => /neither exported nor listed/.test(problem) || /revision content hash/.test(problem)));
  });
});
