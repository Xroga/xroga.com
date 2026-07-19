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
    assert.ok(result.issues.some((i) => /page\.tsx/i.test(i)));
  });

  it('accepts static index.html', () => {
    const result = staticValidateProject([
      { path: 'index.html', content: '<!doctype html><html><body>Hi</body></html>' },
    ]);
    assert.equal(result.kind, 'static');
    assert.equal(result.ok, true);
  });
});
