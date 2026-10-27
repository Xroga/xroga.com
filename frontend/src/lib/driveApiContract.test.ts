import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

/**
 * Every request the Drive frontend can make must be a route the backend serves with the same method, every route must be reachable
 * from the client, the router must be mounted behind authentication, and the feature must stay off until it is activated.
 */
const root = resolve(process.cwd(), process.cwd().endsWith('frontend') ? '..' : '.');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const normalise = (path: string) => path.replace(/(?<!\/)\$\{[^}]*\}/g, '').replace(/\$\{[^}]*\}/g, ':p').replace(/:[A-Za-z]+/g, ':p').replace(/\?.*$/, '').replace(/^\/api\/drive/, '');

function served(): Set<string> {
  const out = new Set<string>();
  for (const m of read('backend/src/routes/drive.ts').matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)) out.add(`${m[1].toUpperCase()} ${normalise(m[2])}`);
  return out;
}

function used(): Array<{ call: string }> {
  const calls: Array<{ call: string }> = [];
  const source = read('frontend/src/lib/driveApi.ts');
  for (const m of source.matchAll(/apiFetch<[^>]*(?:<[^>]*>[^>]*)*>\(\s*[`'](\/api\/drive[^`']*)[`']\s*(?:,\s*\{([^}]*)\})?/g)) {
    const method = /method:\s*'(\w+)'/.exec(m[2] ?? '')?.[1] ?? 'GET';
    calls.push({ call: `${method} ${normalise(m[1])}` });
  }
  return calls;
}

describe('Drive frontend and backend are connected', () => {
  it('every client call is a route the backend serves, with the same method', () => {
    const routes = served();
    const calls = used();
    assert.ok(calls.length >= 7, `found ${calls.length} client calls`);
    for (const { call } of calls) assert.ok(routes.has(call), `${call} is not served (served: ${[...routes].join(', ')})`);
  });

  it('every Drive route the backend serves is reachable from the client', () => {
    const calls = new Set(used().map((c) => c.call));
    for (const route of served()) assert.ok(calls.has(route), `${route} has no client call`);
  });

  it('the router is mounted behind authentication', () => {
    assert.match(read('backend/src/index.ts'), /app\.use\('\/api\/drive',\s*authMiddleware,\s*driveRouter\)/);
  });

  it('is off by default, gates the page, and the panel never calls window.confirm', () => {
    assert.match(read('frontend/src/lib/driveApi.ts'), /DRIVE_ENABLED = process\.env\.NEXT_PUBLIC_XROGA_DRIVE === '1'/);
    assert.match(read('frontend/src/app/(shell)/drive/page.tsx'), /if \(!DRIVE_ENABLED\) notFound\(\)/);
    assert.doesNotMatch(read('frontend/src/components/drive/DrivePanel.tsx'), /window\.confirm|\bconfirm\(/);
  });

  it('shows a file as stored only from the server\'s recorded state, and lists failures instead of hiding them', () => {
    const panel = read('frontend/src/components/drive/DrivePanel.tsx');
    assert.match(panel, /object\.state === 'READY' \? \(\s*<button[\s\S]*?aria-label=\{`Download /);
    assert.match(panel, /t\.error \? 'Not stored'/);
    assert.match(panel, /role="alert"/);
  });
});
