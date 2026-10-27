import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const src = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../index.ts'), 'utf8');

describe('/api/drive registration', () => {
  it('is mounted exactly once, behind authMiddleware, and not under any public/guest prefix', () => {
    const mounts = src.split('\n').filter((l) => l.includes("'/api/drive'"));
    assert.equal(mounts.length, 1);
    assert.match(mounts[0], /app\.use\('\/api\/drive',\s*authMiddleware,\s*driveRouter\)/);
    const mountLine = src.split('\n').findIndex((l) => l.includes("'/api/drive'"));
    const publicLine = src.split('\n').findIndex((l) => l.includes("'/api/guest'"));
    assert.ok(mountLine > publicLine, 'registered after the public/guest section and the body parser');
  });
  it('the legacy public-asset media surface remains retired and unrelated to Drive', () => {
    const media = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), './media.ts'), 'utf8');
    assert.match(media, /createRetiredRouter\('media'\)/);
    assert.ok(!/drive/i.test(media));
  });
});
