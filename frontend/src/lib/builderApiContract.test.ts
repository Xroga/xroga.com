import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

/**
 * Every request the Builder frontend can make must be a route the backend actually serves with the same
 * method, and every route must be mounted behind authentication. This catches the class of defect where a
 * client and a server are each correct alone but are not connected.
 */
const root = resolve(process.cwd(), process.cwd().endsWith('frontend') ? '..' : '.');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const normalise = (path: string) => path.replace(/\$\{[^}]*\}/g, ':p').replace(/\$\{[^`]*$/, '').replace(/:[A-Za-z]+/g, ':p').replace(/\?.*$/, '');

function served(): Set<string> {
  const files = ['backend/src/routes/builder.ts', 'backend/src/routes/builderPhase2.ts', 'backend/src/routes/builderPhase3.ts'];
  const out = new Set<string>();
  for (const file of files) {
    for (const match of read(file).matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)) out.add(`${match[1].toUpperCase()} ${normalise(match[2])}`);
  }
  return out;
}

function used(): Array<{ file: string; call: string }> {
  const calls: Array<{ file: string; call: string }> = [];
  for (const file of ['frontend/src/lib/builderApi.ts', 'frontend/src/lib/builderApiPhase2.ts', 'frontend/src/lib/builderApiPhase3.ts']) {
    const source = read(file);
    // request<T>(`/path`, { method: 'POST' ...}) and request<T>('/path') and post<T>(`/path`)
    for (const match of source.matchAll(/(?:request|post)<(?:(?!request<|post<)[\s\S])*?>\(\s*[`'](\/[^`']*)[`']\s*(?:,\s*(\{[^}]*\}))?/g)) {
      const method = /method:\s*'([A-Z]+)'/.exec(match[2] ?? '')?.[1] ?? (match[0].startsWith('post') ? 'POST' : 'GET');
      calls.push({ file, call: `${method} ${normalise(match[1])}` });
    }
    // the download helper used for the ZIP
    for (const match of source.matchAll(/download\(\s*`([^`]+)`/g)) calls.push({ file, call: `GET ${normalise(match[1])}` });
  }
  return calls;
}

describe('Builder frontend and backend are connected', () => {
  it('every client call is a route the backend serves, with the same method', () => {
    const routes = served();
    const calls = used();
    assert.ok(calls.length >= 35, `found ${calls.length} client calls`);
    const missing = calls.filter(({ call }) => !routes.has(call)).map(({ file, call }) => `${file}: ${call}`);
    assert.deepEqual(missing, []);
  });

  it('every builder route is used by the client, except those reached another way', () => {
    const routes = served();
    const calls = new Set(used().map(({ call }) => call));
    const reachedElsewhere = new Set(['GET /projects/:p/revisions/:p']);
    const unused = [...routes].filter((route) => !calls.has(route) && !reachedElsewhere.has(route));
    assert.deepEqual(unused, [], 'a server route nothing calls is either dead code or a disconnected feature');
  });

  it('the router is mounted behind authentication and builds are reached through the existing swarm route', () => {
    const index = read('backend/src/index.ts');
    assert.match(index, /app\.use\('\/api\/builder', authMiddleware, builderRouter\)/);
    assert.match(read('backend/src/routes/swarm.ts'), /builderProjectId/);
    assert.match(read('frontend/src/context/TerminalChatContext.tsx'), /resolveBuilderProject/);
  });

  it('the Builder UI is flagged off by default and the project panel is reachable from the workspace', () => {
    assert.match(read('frontend/src/lib/builderApi.ts'), /BUILDER_ENABLED = process\.env\.NEXT_PUBLIC_XROGA_BUILDER === '1'/);
    assert.match(read('frontend/src/components/terminal/DevWorkspacePanel.tsx'), /BuilderProjectPanel/);
    const panel = read('frontend/src/components/terminal/BuilderProjectPanel.tsx');
    for (const component of ['BuilderHistory', 'BuilderTests', 'BuilderDelivery', 'BuilderDatabase', 'BuilderHosting', 'BuilderProvenance']) {
      assert.match(panel, new RegExp(`<${component}`), `${component} is rendered`);
    }
  });
});
