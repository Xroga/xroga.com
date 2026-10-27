import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const script = join(repoRoot, 'scripts/check-supabase-migrations.mjs');

/** run with an EMPTY environment: the check must need no variable, and must not reveal any */
function run(dir: string, extra: string[] = []) {
  const r = spawnSync(process.execPath, [script, '--dir', dir, ...extra], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '' } });
  return { code: r.status, out: `${r.stdout}\n${r.stderr}` };
}

describe('offline migration check (the pull-request replacement for the live dry run)', () => {
  let dir: string;
  before(() => { dir = mkdtempSync(join(tmpdir(), 'mig-')); });
  after(() => rmSync(dir, { recursive: true, force: true }));
  const put = (name: string, sql: string) => writeFileSync(join(dir, name), sql);
  const clean = () => { for (const f of ['0001_a.sql', '0002_b.sql', '0002_c.sql', 'bad name.sql', '0003_empty.sql', '0004_x.sql']) rmSync(join(dir, f), { force: true }); };

  it('the repository\'s real migrations pass', () => {
    const r = run(join(repoRoot, 'supabase/migrations'));
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /"ok":true/);
  });

  it('accepts ordinary migrations', () => {
    clean();
    put('0001_a.sql', 'create table if not exists public.t (id int);');
    put('0002_b.sql', "-- drop database in a comment is fine\ninsert into public.t values (1); select 'drop database';");
    assert.equal(run(dir).code, 0);
  });

  it('refuses a bad file name, a duplicate prefix and an empty file', () => {
    clean(); put('bad name.sql', 'select 1;');
    assert.equal(run(dir).code, 1);
    clean(); put('0002_b.sql', 'select 1;'); put('0002_c.sql', 'select 2;');
    const dup = run(dir); assert.equal(dup.code, 1); assert.match(dup.out, /same numeric prefix/);
    clean(); put('0003_empty.sql', '  \n');
    const empty = run(dir); assert.equal(empty.code, 1); assert.match(empty.out, /empty/);
  });

  it('refuses statements that can never be a migration', () => {
    for (const sql of ['drop database prod;', 'ALTER SYSTEM SET max_connections = 1;', "create role r superuser;", "copy t to program 'sh';"]) {
      clean(); put('0004_x.sql', sql);
      const r = run(dir);
      assert.equal(r.code, 1, sql);
    }
  });

  it('lists destructive statements for human review without failing, but only for files this change touches', () => {
    clean(); put('0004_x.sql', 'truncate public.t; delete from public.t; grant all on public.t to anon;');
    const untouched = run(dir);
    assert.equal(untouched.code, 0);
    assert.ok(!/needs human review/.test(untouched.out), 'files outside the change are not flagged');
  });

  it('flags destructive statements in the files a change adds or edits (listed, not failed)', () => {
    const repo = mkdtempSync(join(tmpdir(), 'migrepo-'));
    try {
      const sh = (...a: string[]) => spawnSync('git', a, { cwd: repo, encoding: 'utf8' });
      sh('init', '-q', '-b', 'main'); sh('config', 'user.email', 't@example.com'); sh('config', 'user.name', 't'); sh('config', 'commit.gpgsign', 'false');
      mkdirSync(join(repo, 'm')); writeFileSync(join(repo, 'm/0001_a.sql'), 'select 1;'); sh('add', '-A'); sh('commit', '-q', '-m', 'base');
      sh('checkout', '-q', '-b', 'change');
      writeFileSync(join(repo, 'm/0002_b.sql'), 'truncate public.t; grant all on public.t to anon;'); sh('add', '-A'); sh('commit', '-q', '-m', 'change');
      const r = spawnSync(process.execPath, [script, '--dir', join(repo, 'm'), '--base', 'main'], { cwd: repo, encoding: 'utf8', env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '' } });
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /needs human review: 0002_b\.sql: TRUNCATE/);
      assert.match(r.stdout, /needs human review: 0002_b\.sql: grants write access to a browser-facing role/);
      assert.ok(!/0001_a\.sql: /.test(r.stdout), 'the unchanged base file is not flagged');
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });

  it('needs no environment, makes no connection and prints no environment value', () => {
    clean(); put('0001_a.sql', 'select 1;');
    const secret = 'service-role-key-0123456789abcdef';
    const r = spawnSync(process.execPath, [script, '--dir', dir], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '', SUPABASE_SERVICE_ROLE_KEY: secret, DATABASE_URL: `postgresql://u:${secret}@h/db` } });
    assert.equal(r.status, 0);
    assert.ok(!`${r.stdout}${r.stderr}`.includes(secret));
    const src = readFileSync(script, 'utf8');
    assert.ok(!/process\.env/.test(src), 'the script never reads the environment');
    assert.ok(!/\b(fetch|https?\.request|net\.connect|pg\b|postgres)/.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')), 'the script has no network or database client');
  });
});

describe("the migration workflow never mutates a database (main's validation-only gate)", () => {
  const wf = readFileSync(join(repoRoot, '.github/workflows/supabase-migrate.yml'), 'utf8');
  const code = wf.replace(/#[^\n]*/g, '');

  it('has no environment, no secret reference and no write permission, so no event can reach a database', () => {
    assert.ok(!/^\s*environment:/m.test(code), 'no GitHub Environment');
    assert.ok(!/secrets\./.test(code), 'no secret reference');
    assert.match(code, /permissions:\s*\n\s+contents:\s*read/);
  });

  it('only validates: it never runs the live migration runner or a dry run', () => {
    assert.match(code, /node scripts\/ci\/validate-migrations\.mjs/);
    assert.ok(!/run:\s*node scripts\/apply-supabase-migrations/.test(code), 'the live runner is not invoked');
    assert.ok(!/--dry-run/.test(code), 'no live dry run');
  });
});
