import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discoverRuntimeSource } from './runtime-discovery.mjs';

test('environment names include property, indexed constant, aliases and destructuring without values', () => {
  const source = `const NAME = 'MODEL_API_KEY'; const env = process.env; const {SUPABASE_URL: url} = env;
    const secret = process.env[NAME]; const endpoint = env.API_PUBLIC_URL;`;
  const result = discoverRuntimeSource('backend/src/config/fixture.ts', source);
  assert.deepEqual([...new Set(result.readers.map(row => row.name))].sort(), ['API_PUBLIC_URL', 'MODEL_API_KEY', 'SUPABASE_URL']);
  assert.equal(result.dynamic.length, 0);
});
test('typed/default environment parameters and fallback objects are inspected without treating scalar strings as env objects', () => {
  const result = discoverRuntimeSource('backend/src/config/fixture.ts', `function config(env: NodeJS.ProcessEnv = process.env) {return env.XROGA_ROUTING_MODE;}
    const url = process.env.SUPABASE_URL; url.trim(); const runtime = override ?? process.env; runtime.PORT;`);
  assert.deepEqual([...new Set(result.readers.map(row => row.name))].sort(), ['PORT', 'SUPABASE_URL', 'XROGA_ROUTING_MODE']);
});
test('an environment alias cannot escape its function or turn a shadowed options object into process environment', () => {
  const result = discoverRuntimeSource('backend/src/config/fixture.ts', `function config(){const input = process.env; return input.PORT;}
    function unrelated(input: {role:string}){return input.role;} const env = process.env;
    function shadow(env: {evidence:string}) {return env.evidence;}
    function options(input: {env: NodeJS.ProcessEnv, role:string}){return input.role;}`);
  assert.deepEqual(result.readers.map(row => row.name), ['PORT']);
});
test('canonical secret aliases and imported helper names are inventoried, including legacy alias spelling', () => {
  const alias = discoverRuntimeSource('backend/src/config/envSecrets.ts', `const ALIASES = { IMMERSITY_CLIENT_ID: ['IMMERSITY_CLIENT_ID', 'Immersity_Client_ID'] };`);
  assert.deepEqual(alias.readers.map(row => row.name), ['IMMERSITY_CLIENT_ID', 'Immersity_Client_ID']);
  const helper = discoverRuntimeSource('backend/src/lib/fixture.ts', `import {getSecret as credential} from '../config/envSecrets.js'; credential('KIMI_API_KEY');`);
  assert.equal(helper.readers[0].name, 'KIMI_API_KEY');
});
test('dynamic environment names are explicit unresolved bindings, not fabricated names', () => {
  const result = discoverRuntimeSource('backend/src/config/fixture.ts', `function config(env: NodeJS.ProcessEnv = process.env, key: string) {return env[key];}`);
  assert.equal(result.dynamic.length, 1);
  assert.equal(result.dynamic[0].status, 'REQUIRES_BINDING_REVIEW');
  assert.deepEqual(result.readers, []);
});
test('URL discovery retains only host/protocol and flags embedded credentials without disclosing them', () => {
  const result = discoverRuntimeSource('backend/src/config/fixture.ts', `const endpoint = 'https://actor:credential-canary@api.example.org/private?token=credential-canary';`);
  assert.equal(result.hosts[0].hostname, 'api.example.org');
  assert.equal(result.hosts[0].credentialsInUrl, true);
  assert.doesNotMatch(JSON.stringify(result), /credential-canary/);
});
test('memory/filesystem candidates preserve scope without claiming that static collections are unsafe storage', () => {
  const result = discoverRuntimeSource('backend/src/config/fixture.ts', `const state = new Map(); const fixed = new Set(['allowed']); function plan(){const temporary = new Map(); writeFile(path, content);}`);
  assert.equal(result.fallbackCandidates.filter(row => row.scope === 'MODULE_LIFETIME').length, 2);
  assert.equal(result.fallbackCandidates.filter(row => row.scope === 'FUNCTION_LOCAL').length, 2);
  assert.ok(result.fallbackCandidates.every(row => row.status === 'REQUIRES_SEMANTIC_REVIEW'));
});
test('block aliases/constants and parameter shadows cannot fabricate indexed environment names', () => {
  const result = discoverRuntimeSource('backend/src/config/fixture.ts', `const KEY = 'OUTER_KEY';
    { const KEY = 'INNER_KEY'; const block = process.env; block[KEY]; }
    process.env[KEY]; function shadow(KEY: string){return process.env[KEY];}
    function unrelated(block: {role: string}) {return block.role;}`);
  assert.deepEqual(result.readers.map(row => row.name), ['INNER_KEY', 'OUTER_KEY']);
  assert.equal(result.dynamic.length, 1);
});
test('template URL hosts and instance-lifetime stores are discovered without storing query values', () => {
  const result = discoverRuntimeSource('backend/src/config/fixture.ts', 'fetch(`https://api.example.org/v1/${id}?token=${token}`); class Store {private values = new Map();}');
  assert.equal(result.hosts[0].hostname, 'api.example.org');
  assert.equal(result.fallbackCandidates[0].scope, 'INSTANCE_LIFETIME');
  assert.doesNotMatch(JSON.stringify(result.hosts), /token/);
});
