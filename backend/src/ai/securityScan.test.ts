import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { redactCriticalSecrets, scanProjectFiles } from './securityScan.js';
import { staticValidateProject } from './staticValidate.js';

describe('securityScan', () => {
  it('blocks hardcoded OpenAI-style keys', () => {
    const result = scanProjectFiles([
      { path: 'app.js', content: 'const k = "sk-abcdefghijklmnopqrstuvwxyz0123456789";' },
    ]);
    assert.equal(result.blocked, true);
    assert.ok(result.findings.some((f) => f.severity === 'critical'));
  });

  it('redacts secrets', () => {
    const files = redactCriticalSecrets([
      { path: 'a.js', content: 'key=sk-abcdefghijklmnopqrstuvwxyz0123456789' },
    ]);
    assert.match(files[0].content, /REDACTED_SECRET/);
  });
});

describe('staticValidateProject', () => {
  it('flags Next without page', () => {
    const result = staticValidateProject([
      {
        path: 'package.json',
        content: JSON.stringify({ dependencies: { next: '15.0.0' }, scripts: { build: 'next build' } }),
      },
    ]);
    assert.equal(result.kind, 'nextjs');
    assert.ok(result.issues.some((i) => /app\/page|pages\/index/i.test(i)));
  });

  it('accepts valid JavaScript Next.js App Router entry files', () => {
    const result = staticValidateProject([
      {
        path: 'package.json',
        content: JSON.stringify({ dependencies: { next: '15.0.0' }, scripts: { build: 'next build' } }),
      },
      { path: 'app/page.js', content: 'export default function Page(){return <main>Orbit</main>}' },
      {
        path: 'app/layout.js',
        content: 'export default function Layout({children}){return <html><body>{children}</body></html>}',
      },
    ]);
    assert.equal(result.kind, 'nextjs');
    assert.equal(result.ok, true);
    assert.deepEqual(result.issues, []);
  });

  it('accepts static index.html', () => {
    const result = staticValidateProject([
      { path: 'index.html', content: '<!doctype html><html><body>Hi</body></html>' },
    ]);
    assert.equal(result.kind, 'static');
    assert.equal(result.ok, true);
  });

  it('does not require a web preview entry from a non-web repository', () => {
    const result = staticValidateProject([
      { path: 'requirements.txt', content: 'pytest>=8,<9\n' },
      { path: 'normalize.py', content: 'def normalize(value):\n    return value.strip()\n' },
      { path: 'tests/test_normalize.py', content: 'def test_normalize():\n    assert True\n' },
    ]);

    assert.equal(result.kind, 'unknown');
    assert.equal(result.ok, true);
    assert.ok(!result.issues.some((issue) => /nothing to preview/i.test(issue)));
  });

  it('still requires index.html when a repository presents an HTML surface', () => {
    const result = staticValidateProject([
      { path: 'about.html', content: '<!doctype html><html><body>About</body></html>' },
    ]);

    assert.equal(result.ok, false);
    assert.ok(result.issues.some((issue) => /nothing to preview/i.test(issue)));
  });
});
