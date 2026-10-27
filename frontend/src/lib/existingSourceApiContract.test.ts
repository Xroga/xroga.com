import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

/**
 * Every request the existing-repository screen can make is a route the backend serves with the same method, every route is reachable
 * from the client, the router is mounted behind authentication, the feature is off by default, and the screen never invents state.
 */
const root = resolve(process.cwd(), process.cwd().endsWith('frontend') ? '..' : '.');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const normalise = (path: string) => path.replace(/(?<!\/)\$\{[^}]*\}/g, '').replace(/\$\{[^}]*\}/g, ':p').replace(/:[A-Za-z]+/g, ':p').replace(/\?.*$/, '').replace(/^\/api\/existing-source/, '');

function served(): Set<string> {
  const out = new Set<string>();
  for (const m of read('backend/src/routes/existingSource.ts').matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)) out.add(`${m[1]!.toUpperCase()} ${normalise(m[2]!)}`);
  return out;
}

function used(): string[] {
  const calls: string[] = [];
  const source = read('frontend/src/lib/existingSourceApi.ts').replace(/const base = '\/api\/existing-source';/, '').replace(/\$\{base\}/g, '/api/existing-source');
  for (const m of source.matchAll(/apiFetch<[^>]*(?:<[^>]*>[^>]*)*>\(\s*[`'](\/api\/existing-source[^`']*)[`']\s*(?:,\s*\{([^}]*)\})?/g)) {
    calls.push(`${/method:\s*'(\w+)'/.exec(m[2] ?? '')?.[1] ?? 'GET'} ${normalise(m[1]!)}`);
  }
  return calls;
}

describe('existing-repository frontend and backend are connected', () => {
  it('every client call is a served route with the same method, and every route is reachable', () => {
    const routes = served(); const calls = used();
    assert.ok(calls.length >= 8, `found ${calls.length} client calls`);
    for (const call of calls) assert.ok(routes.has(call), `${call} is not served (served: ${[...routes].join(', ')})`);
    for (const route of routes) assert.ok(calls.includes(route), `${route} has no client call`);
  });

  it('is mounted behind authentication, off by default on both sides, and gates its page', () => {
    assert.match(read('backend/src/index.ts'), /app\.use\('\/api\/existing-source',\s*authMiddleware,\s*existingSourceRouter\)/);
    assert.match(read('backend/src/routes/existingSource.ts'), /XROGA_EXISTING_SOURCE === '1'/);
    assert.match(read('frontend/src/lib/existingSourceApi.ts'), /EXISTING_SOURCE_ENABLED = process\.env\.NEXT_PUBLIC_XROGA_EXISTING_SOURCE === '1'/);
    assert.match(read('frontend/src/app/(shell)/dashboard/existing-source/page.tsx'), /if \(!EXISTING_SOURCE_ENABLED\) notFound\(\)/);
  });

  it('names a repository only by its provider id and never holds a token or a path outside the repository', () => {
    const api = read('frontend/src/lib/existingSourceApi.ts');
    const panel = read('frontend/src/components/existing-source/ExistingSourcePanel.tsx');
    assert.match(api, /repositoryId: string/);
    assert.doesNotMatch(api + panel, /access_token|Authorization|localStorage|sessionStorage/);
  });

  it('shows the recorded link state and never opens a credential file from the list', () => {
    const panel = read('frontend/src/components/existing-source/ExistingSourcePanel.tsx');
    assert.match(panel, /disabled=\{e\.sensitive \|\| e\.type === 'symlink' \|\| e\.type === 'submodule'\}/);
    assert.match(panel, /credentials, never shown/);
    assert.match(panel, /Missing files are not proven absent/);
    assert.match(panel, /Xroga keeps reading/);
    assert.match(panel, /role="alert"/);
    assert.doesNotMatch(panel, /window\.confirm|\bconfirm\(/);
  });
});
