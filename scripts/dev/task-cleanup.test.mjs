import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, after } from 'node:test';

const script = resolve(fileURLToPath(new URL('./task-cleanup.mjs', import.meta.url)));
const root = mkdtempSync(join(tmpdir(), 'xroga-cleanup-'));
after(() => rmSync(root, { recursive: true, force: true }));
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...process.env, XROGA_TASK_ROOT: root } });

describe('task storage hygiene', () => {
  it('rejects task ids that could escape the scratch root', () => {
    for (const bad of ['..', '../x', 'a/b', 'A', '', '-x', 'a..b']) assert.notEqual(run('begin', bad).status, 0, bad);
  });

  it('a dry run deletes nothing and reports the size', () => {
    run('begin', 'dry');
    writeFileSync(join(root, '.task-scratch', 'dry', 'big.bin'), Buffer.alloc(1024 * 1024));
    const r = run('clean', 'dry');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /DRY RUN/);
    assert.ok(existsSync(join(root, '.task-scratch', 'dry', 'big.bin')));
  });

  it('--apply removes only the task scratch directory and leaves everything else', () => {
    run('begin', 'one'); run('begin', 'other');
    writeFileSync(join(root, '.task-scratch', 'one', 'a.log'), 'x');
    writeFileSync(join(root, '.task-scratch', 'other', 'keep.log'), 'x');
    writeFileSync(join(root, 'source.ts'), 'keep');
    const r = run('clean', 'one', '--apply');
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!existsSync(join(root, '.task-scratch', 'one')));
    assert.ok(existsSync(join(root, '.task-scratch', 'other', 'keep.log')), 'another task is untouched');
    assert.ok(existsSync(join(root, 'source.ts')), 'repository files are untouched');
  });

  it('refuses to clean a scratch directory that is a link, and never follows it', () => {
    const outside = mkdtempSync(join(tmpdir(), 'xroga-outside-'));
    writeFileSync(join(outside, 'precious.txt'), 'keep');
    mkdirSync(join(root, '.task-scratch'), { recursive: true });
    try { symlinkSync(outside, join(root, '.task-scratch', 'linked'), 'junction'); } catch { rmSync(outside, { recursive: true, force: true }); return; }
    const r = run('clean', 'linked', '--apply');
    assert.notEqual(r.status, 0);
    assert.ok(existsSync(join(outside, 'precious.txt')), 'the link target is untouched');
    rmSync(join(root, '.task-scratch', 'linked'), { force: true, recursive: true });
    rmSync(outside, { recursive: true, force: true });
  });

  it('refuses images that are not exact xroga- tags (no wildcard, no prune)', () => {
    for (const bad of ['ubuntu:24.04', 'xroga', '*', 'xroga-x;rm', '']) {
      const r = run('clean', 'img', '--image', bad);
      assert.notEqual(r.status, 0, `accepted ${bad}`);
    }
  });

  it('run always cleans, even when the command fails, and returns its exit code', () => {
    const r = run('run', 'failing', '--min-free-gb', '0', '--', process.execPath, '-e', 'require("fs").writeFileSync(process.env.XROGA_TASK_SCRATCH + "/t.tmp","x"); process.exit(7)');
    assert.equal(r.status, 7, r.stderr + r.stdout);
    assert.ok(!existsSync(join(root, '.task-scratch', 'failing')), 'scratch removed after a failed task');
    assert.match(r.stdout, /CLEANED/);
  });

  it('stops before the task when free space is below the minimum', () => {
    const r = run('run', 'lowspace', '--min-free-gb', '999999', '--', process.execPath, '-e', 'process.exit(0)');
    assert.equal(r.status, 3);
    assert.ok(!existsSync(join(root, '.task-scratch', 'lowspace')));
  });
});
