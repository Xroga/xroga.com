import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../scripts/verify-source-equivalence.sh');
const bash = process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash';

describe('source equivalence between a CI-tested commit and a later one', () => {
  let repo: string;
  const git = (...a: string[]) => spawnSync('git', a, { cwd: repo, encoding: 'utf8' });
  const put = (rel: string, text: string) => { mkdirSync(dirname(join(repo, rel)), { recursive: true }); writeFileSync(join(repo, rel), text); };
  const commit = (msg: string) => { git('add', '-A'); git('commit', '-q', '-m', msg); return git('rev-parse', 'HEAD').stdout.trim(); };
  const check = (from: string, to: string) => { const r = spawnSync(bash, [script, from, to], { cwd: repo, encoding: 'utf8' }); return { code: r.status, out: r.stdout + r.stderr }; };
  let base: string;

  before(() => {
    repo = mkdtempSync(join(tmpdir(), 'equiv-'));
    git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@example.com'); git('config', 'user.name', 't'); git('config', 'commit.gpgsign', 'false');
    put('backend/src/a.ts', 'export const a = 1;\n');
    put('docs/infra/batch-1.5/evidence/run.mjs', 'console.log(1)\n');
    put('docs/infra/batch-1.5/evidence/logs/x.log', 'ok\n');
    put('docs/infra/batch-1.5/rollback/r.down.sql', 'select 1;\n');
    put('docs/infra/batch-1.5/phase-2/README.md', 'a\n');
    base = commit('base');
  });
  after(() => rmSync(repo, { recursive: true, force: true }));

  it('documentation and recorded evidence output are equivalent', () => {
    put('docs/infra/batch-1.5/phase-2/README.md', 'b\n');
    put('docs/infra/batch-1.5/phase-2/new.md', 'c\n');
    put('docs/infra/batch-1.5/evidence/logs/x.log', 'changed\n');
    put('docs/infra/batch-1.5/ci-evidence/run-1/results.json', '{}\n');
    const c = commit('docs');
    const r = check(base, c);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /EQUIVALENT/);
  });

  it('a source file change is not equivalent', () => {
    put('backend/src/a.ts', 'export const a = 2;\n');
    const c = commit('code');
    const r = check(base, c);
    assert.equal(r.code, 1);
    assert.match(r.out, /code\s+backend\/src\/a\.ts/);
  });

  it('files CI executes are code even though they live under docs/: the strict runner and the rollback SQL', () => {
    for (const [path, text] of [['docs/infra/batch-1.5/evidence/run.mjs', 'console.log(2)\n'], ['docs/infra/batch-1.5/rollback/r.down.sql', 'select 2;\n']] as const) {
      const before = git('rev-parse', 'HEAD').stdout.trim();
      put(path, text);
      const c = commit(`touch ${path}`);
      const r = check(before, c);
      assert.equal(r.code, 1, path);
      assert.match(r.out, new RegExp(`code\\s+${path.replace(/[.]/g, '\\.')}`));
    }
  });

  it('a script or workflow outside docs/ is code; one code file among many docs makes the whole range not equivalent', () => {
    const before = git('rev-parse', 'HEAD').stdout.trim();
    put('docs/infra/batch-1.5/phase-2/a.md', 'x\n'); put('.github/workflows/w.yml', 'name: w\n'); put('scripts/s.sh', 'echo\n');
    const c = commit('mixed');
    const r = check(before, c);
    assert.equal(r.code, 1);
    assert.match(r.out, /code\s+\.github\/workflows\/w\.yml/);
    assert.match(r.out, /code\s+scripts\/s\.sh/);
    assert.match(r.out, /doc\s+docs\/infra\/batch-1\.5\/phase-2\/a\.md/);
  });

  it('an unknown commit is an error, not a pass', () => {
    assert.equal(check('deadbeefdeadbeef', 'HEAD').code, 2);
  });

  it('the same commit is trivially equivalent', () => {
    assert.equal(check(base, base).code, 0);
  });
});
