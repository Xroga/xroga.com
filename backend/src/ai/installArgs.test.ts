import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

/**
 * The sandbox install command.
 *
 * Two properties, one safety and one product.
 *
 * `--ignore-scripts` is the boundary that stops a model-generated `package.json` from
 * running arbitrary code on our machine during validation. It is not a performance
 * flag and must survive every future edit to this command.
 *
 * The shared cache and the bounded retries exist because run `dca6799a` spent its
 * entire 180-second install budget downloading a Next.js dependency tree from cold and
 * timed out, which discarded a finished twenty-one-file project.
 */

async function installArgs(): Promise<string> {
  const source = await readFile(new URL('./compileValidate.ts', import.meta.url), 'utf8');
  const start = source.indexOf('const INSTALL_ARGS');
  assert.ok(start > -1, 'INSTALL_ARGS should be a named constant');
  return source.slice(start, source.indexOf('];', start));
}

test('lifecycle scripts are never run during validation', async () => {
  assert.match(await installArgs(), /--ignore-scripts/);
});

test('installs share one cache, so the tree is downloaded once per machine', async () => {
  const args = await installArgs();
  assert.match(args, /--cache=/);
  assert.match(args, /NPM_CACHE_DIR/);
});

test('a failing network fails fast instead of eating the whole budget', async () => {
  const args = await installArgs();
  assert.match(args, /--fetch-retries=\d/);
  assert.match(args, /--fetch-retry-maxtimeout=\d+/);
});

test('the cache lives in the ephemeral temp filesystem, not in a user directory', async () => {
  const source = await readFile(new URL('./compileValidate.ts', import.meta.url), 'utf8');
  const line = source.slice(source.indexOf('const NPM_CACHE_DIR'));
  assert.match(line.slice(0, 120), /tmpdir\(\)/);
});
