import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const api = readFileSync(new URL('./api.ts', import.meta.url), 'utf8');
const share = readFileSync(new URL('../app/share/[token]/page.tsx', import.meta.url), 'utf8');

test('development API fallbacks use the backend port declared by AGENTS.md', () => {
  for (const source of [api]) {
    assert.match(source, /http:\/\/localhost:8080/);
    assert.doesNotMatch(source, /http:\/\/localhost:4000/);
  }
  assert.match(share, /import \{ API_URL, fetchApiResponse \} from ['"]@\/lib\/api['"]/);
  assert.match(share, /fetchApiResponse\(`\$\{API_URL\}\/api\/message-shares\//);
  assert.doesNotMatch(share, /(?:const|let)\s+API_URL\s*=/);
  assert.doesNotMatch(share, /http:\/\/localhost:4000/);
});
