import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const root = resolve(process.cwd(), process.cwd().endsWith('frontend') ? '..' : '.');
const client = readFileSync(resolve(root, 'frontend/src/lib/builderApiPhase3.ts'), 'utf8');
const routes = readFileSync(resolve(root, 'backend/src/routes/builderPhase3.ts'), 'utf8');
const hosting = readFileSync(resolve(root, 'frontend/src/components/terminal/builder/BuilderHosting.tsx'), 'utf8');

const normalise = (path: string) => path.replace(/\$\{[^}]+\}/g, ':p');

describe('Phase 3 client and API stay in step', () => {
  it('every client path is a route the backend serves, with the same method', () => {
    const served = new Set([...routes.matchAll(/router\.(get|post)\('([^']+)'/g)].map((match) => `${match[1].toUpperCase()} ${match[2].replace(/:[A-Za-z]+/g, ':p')}`));
    const used = [...client.matchAll(/(request|post)<[^`'(]*>\((?:`|')([^`']+)(?:`|')/g)].map((match) => `${match[1] === 'post' ? 'POST' : 'GET'} ${normalise(match[2])}`);
    assert.ok(used.length >= 18, `found ${used.length} client calls`);
    const missing = used.filter((entry) => !served.has(entry));
    assert.deepEqual(missing, []);
  });

  it('production is a separate card that stays disabled until the exact phrase is typed', () => {
    assert.match(hosting, /disabled=\{busy !== null \|\| !connected \|\| !confirmationMatches\(typed, production\.plan\.confirmationPhrase\)\}/);
    assert.match(hosting, /Blocked until the remote tests on the preview have passed/);
    assert.ok(!/executeProduction[^;]*executePreview|executePreview[^;]*executeProduction/.test(hosting), 'approving a preview never publishes');
  });

  it('no component renders credential-shaped fields', () => {
    for (const file of ['BuilderDatabase', 'BuilderHosting', 'BuilderProvenance']) {
      const source = readFileSync(resolve(root, `frontend/src/components/terminal/builder/${file}.tsx`), 'utf8');
      assert.ok(!/type="password"|service[_-]?role|secret key/i.test(source.replace(/does not read your secret or service-role key/g, '')), file);
    }
  });
});
