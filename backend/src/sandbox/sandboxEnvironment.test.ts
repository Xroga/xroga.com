import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ForbiddenSandboxVariableError,
  SANDBOX_ALLOWED_PASSTHROUGH,
  buildSandboxEnvironment,
  isForbiddenSandboxVariable,
} from './sandboxEnvironment.js';

/**
 * Cover for the secret-exposure defect.
 *
 * `compileValidate.runCmd` spawned `npm install` and the generated project's own build
 * command with `env: { ...process.env }`. `--ignore-scripts` blocked `postinstall`, but
 * a `build` script is meant to run and its command comes from a model-generated
 * package.json — so the Supabase service-role key, GitHub OAuth tokens, Vercel tokens,
 * every model-provider key and the encryption key were all readable by generated code.
 *
 * These tests pin the replacement boundary. The allowlist direction is the load-bearing
 * property: a denylist has to predict every future secret name and leaks the first one
 * anybody forgets.
 */

/** A parent environment shaped like the real Xroga API process. */
const PARENT_ENV: NodeJS.ProcessEnv = {
  PATH: '/usr/local/bin:/usr/bin',
  HOME: '/home/node',
  TZ: 'UTC',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret',
  SUPABASE_URL: 'https://project.supabase.co',
  GITHUB_TOKEN: 'gho_realtoken',
  VERCEL_TOKEN: 'vercel-secret',
  OPENROUTER_API_KEY: 'sk-or-secret',
  MOONSHOT_API_KEY: 'moonshot-secret',
  ANTHROPIC_API_KEY: 'sk-ant-secret',
  TAVILY_API_KEY: 'tvly-secret',
  DATABASE_URL: 'postgres://user:password@host/db',
  ENCRYPTION_KEY: 'encryption-secret',
  SESSION_SECRET: 'session-secret',
};

test('reproduces the defect: not one parent secret survives into the child environment', () => {
  const env = buildSandboxEnvironment({}, PARENT_ENV);
  const leaked = Object.entries(PARENT_ENV)
    .filter(([name]) => !SANDBOX_ALLOWED_PASSTHROUGH.includes(name))
    .filter(([name]) => name in env);
  assert.deepEqual(leaked, [], `these leaked: ${leaked.map(([n]) => n).join(', ')}`);
});

test('no secret *value* appears anywhere in the child environment', () => {
  // Guards against a future bug that copies a value under a different, innocent name.
  const env = buildSandboxEnvironment({}, PARENT_ENV);
  const serialised = JSON.stringify(env);
  for (const secret of [
    'service-role-secret',
    'gho_realtoken',
    'vercel-secret',
    'sk-or-secret',
    'moonshot-secret',
    'sk-ant-secret',
    'tvly-secret',
    'encryption-secret',
    'session-secret',
    'postgres://user:password@host/db',
  ]) {
    assert.ok(!serialised.includes(secret), `leaked value: ${secret}`);
  }
});

test('the variables a build genuinely needs do survive', () => {
  const env = buildSandboxEnvironment({}, PARENT_ENV);
  assert.equal(env.PATH, '/usr/local/bin:/usr/bin');
  assert.equal(env.HOME, '/home/node');
  assert.equal(env.TZ, 'UTC');
});

test('an unknown future secret is excluded without anyone updating this file', () => {
  // The point of an allowlist: a variable introduced tomorrow is safe today.
  const env = buildSandboxEnvironment(
    {},
    { ...PARENT_ENV, SOME_FUTURE_INTERNAL_CREDENTIAL: 'not-yet-invented' },
  );
  assert.ok(!('SOME_FUTURE_INTERNAL_CREDENTIAL' in env));
  assert.ok(!JSON.stringify(env).includes('not-yet-invented'));
});

test('a caller cannot smuggle a credential in through the explicit extras', () => {
  for (const name of [
    'GITHUB_TOKEN',
    'SUPABASE_SERVICE_ROLE_KEY',
    'MY_API_KEY',
    'db_password',
    'somePrivateThing',
  ]) {
    assert.throws(
      () => buildSandboxEnvironment({ [name]: 'value' }, PARENT_ENV),
      ForbiddenSandboxVariableError,
      name,
    );
  }
});

test('the refusal names the variable but never its value', () => {
  try {
    buildSandboxEnvironment({ GITHUB_TOKEN: 'gho_supersecret' }, PARENT_ENV);
    assert.fail('should have thrown');
  } catch (error) {
    const message = (error as Error).message;
    assert.match(message, /GITHUB_TOKEN/);
    assert.ok(!message.includes('gho_supersecret'), 'the error leaked the secret it refused');
  }
});

test('a harmless extra is allowed through', () => {
  const env = buildSandboxEnvironment({ XROGA_SANDBOX_WORKDIR: '/work' }, PARENT_ENV);
  assert.equal(env.XROGA_SANDBOX_WORKDIR, '/work');
});

test('lifecycle scripts stay disabled and cannot be re-enabled by a caller', () => {
  // Not the security boundary — the sandbox is — but removing the obvious footgun
  // should not be overridable from the same place that supplies generated config.
  const env = buildSandboxEnvironment({ npm_config_ignore_scripts: 'false' }, PARENT_ENV);
  assert.equal(env.npm_config_ignore_scripts, 'true');
  assert.equal(env.CI, '1');
});

test('the credential pattern catches the shapes that actually occur', () => {
  for (const name of [
    'SUPABASE_SERVICE_ROLE_KEY',
    'GITHUB_TOKEN',
    'VERCEL_TOKEN',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'DEEPSEEK_API_KEY',
    'DATABASE_URL',
    'SENTRY_DSN',
    'JWT_SECRET',
    'COOKIE_SECRET',
    'my_private_key',
  ]) {
    assert.equal(isForbiddenSandboxVariable(name), true, name);
  }
});

test('ordinary build variables are not mistaken for credentials', () => {
  for (const name of ['PATH', 'HOME', 'TZ', 'CI', 'NODE_ENV', 'TMPDIR']) {
    assert.equal(isForbiddenSandboxVariable(name), false, name);
  }
});

test('an empty parent environment produces a usable, minimal environment', () => {
  const env = buildSandboxEnvironment({}, {});
  assert.equal(env.CI, '1');
  assert.equal(env.NODE_ENV, 'production');
});
