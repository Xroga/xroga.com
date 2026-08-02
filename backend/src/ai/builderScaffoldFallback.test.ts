import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildScaffoldForPrompt, detectScaffoldKind } from '../services/projectScaffold.js';

/**
 * The deterministic scaffold fallback.
 *
 * These assert the contract the pipeline now depends on: when every builder
 * provider returns empty, prose-only or invalid output, the scaffold must still
 * produce a real, buildable project rather than leaving the run with nothing.
 *
 * Before this change the scaffold merge was gated on the model having already
 * produced files (`!isUpdate && nextFiles.length`), so it could not run in exactly
 * the case it exists for. That gap is the production blocker these cover.
 */

const PROMPTS = [
  'Build a portfolio website with a dark theme',
  'Create a landing page for a coffee shop',
  'Build a Next.js dashboard with charts',
];

test('a scaffold is produced for a prompt with no model output at all', () => {
  for (const prompt of PROMPTS) {
    const { files } = buildScaffoldForPrompt({ prompt, projectName: 'test-project' });
    assert.ok(files.length > 0, `no scaffold files for: ${prompt}`);
  }
});

test('every scaffold is deployable — a manifest with a build, or static entry files', () => {
  // A static site legitimately has no package.json: Vercel serves it directly.
  // What matters is that *something* deployable exists for every prompt.
  for (const prompt of PROMPTS) {
    const { files } = buildScaffoldForPrompt({ prompt, projectName: 'test-project' });
    const manifest = files.find((f) => f.path === 'package.json');
    if (manifest) {
      const parsed = JSON.parse(manifest.content) as { scripts?: Record<string, string> };
      assert.ok(parsed.scripts?.build, `manifest without a build script for: ${prompt}`);
    } else {
      assert.ok(files.some((f) => f.path === 'index.html'), `no manifest and no index.html for: ${prompt}`);
      assert.ok(files.some((f) => f.path === 'vercel.json'), `static site without deploy config: ${prompt}`);
    }
  }
});

test('the static fallback delivers a real page, not an empty stub', () => {
  // Regression guard: this path previously shipped `<h1>name</h1>` with a
  // zero-byte stylesheet and a zero-byte script.
  const { files } = buildScaffoldForPrompt({
    prompt: 'Build a portfolio website with a dark theme',
    projectName: 'p',
  });
  const html = files.find((f) => f.path === 'index.html')!.content;
  const css = files.find((f) => f.path === 'styles.css')!.content;
  assert.ok(css.length > 400, `stylesheet is ${css.length} bytes`);
  assert.match(html, /<nav/i);
  assert.match(html, /<main/i);
  assert.match(html, /<footer/i);
  assert.match(html, /<h1/i);
});

test('the requested theme reaches the generated stylesheet', () => {
  const dark = buildScaffoldForPrompt({ prompt: 'Portfolio site with a dark theme', projectName: 'p' });
  const light = buildScaffoldForPrompt({ prompt: 'Portfolio site, light theme', projectName: 'p' });
  const darkCss = dark.files.find((f) => f.path === 'styles.css')!.content;
  const lightCss = light.files.find((f) => f.path === 'styles.css')!.content;
  assert.notEqual(darkCss, lightCss, 'theme request did not change the stylesheet');
  assert.match(darkCss, /--bg: #0b0d10/);
  assert.match(lightCss, /--bg: #ffffff/);
});

test('every scaffold path is workspace-relative and safe', () => {
  for (const prompt of PROMPTS) {
    const { files } = buildScaffoldForPrompt({ prompt, projectName: 'test-project' });
    for (const file of files) {
      assert.ok(!file.path.startsWith('/'), `absolute path: ${file.path}`);
      assert.ok(!file.path.includes('..'), `traversal in path: ${file.path}`);
      assert.ok(!/^[a-zA-Z]:[\\/]/.test(file.path), `drive-absolute path: ${file.path}`);
      assert.ok(file.path.trim().length > 0, 'empty path');
    }
  }
});

test('no scaffold file is empty, so nothing ships as a placeholder', () => {
  for (const prompt of PROMPTS) {
    const { files } = buildScaffoldForPrompt({ prompt, projectName: 'test-project' });
    for (const file of files) {
      assert.ok(file.content.length > 0, `empty file: ${file.path}`);
    }
  }
});

test('paths are unique — a duplicate would silently overwrite during the write pass', () => {
  for (const prompt of PROMPTS) {
    const { files } = buildScaffoldForPrompt({ prompt, projectName: 'test-project' });
    const paths = files.map((f) => f.path);
    assert.equal(new Set(paths).size, paths.length, `duplicate path for: ${prompt}`);
  }
});

test('the scaffold carries the requested project name rather than a generic one', () => {
  const { files } = buildScaffoldForPrompt({
    prompt: 'Build a portfolio website',
    projectName: 'my-unique-portfolio',
  });
  const joined = files.map((f) => f.content).join('\n');
  assert.match(joined, /my-unique-portfolio/);
});

test('a Next.js request scaffolds a Next.js project, not a static page', () => {
  const kind = detectScaffoldKind('Build a Next.js dashboard with charts');
  assert.equal(kind, 'nextjs');
  const { files } = buildScaffoldForPrompt({
    prompt: 'Build a Next.js dashboard with charts',
    projectName: 'dash',
  });
  const manifest = files.find((f) => f.path === 'package.json');
  const deps = (JSON.parse(manifest!.content) as { dependencies?: Record<string, string> }).dependencies ?? {};
  assert.ok(deps.next, 'Next.js scaffold has no next dependency');
});

test('scaffolding is deterministic — the same prompt yields the same project', () => {
  // Required for resumability: a worker restart must not produce a different tree.
  const a = buildScaffoldForPrompt({ prompt: PROMPTS[0], projectName: 'p' });
  const b = buildScaffoldForPrompt({ prompt: PROMPTS[0], projectName: 'p' });
  assert.deepEqual(
    a.files.map((f) => [f.path, f.content]),
    b.files.map((f) => [f.path, f.content]),
  );
});

test('the scaffold contains no model commentary or placeholder markers', () => {
  for (const prompt of PROMPTS) {
    const { files } = buildScaffoldForPrompt({ prompt, projectName: 'test-project' });
    for (const file of files) {
      assert.doesNotMatch(file.content, /TODO: implement|\.\.\.rest of|<!-- placeholder -->/i, file.path);
      assert.doesNotMatch(file.content, /^I (cannot|can't|am unable)/im, file.path);
    }
  }
});
