import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * In the shell's gray theme the accent colour is near white, so white text on an accent background was unreadable (about 1.1:1) in a
 * real browser. Filled buttons here use the foreground/background pair, which always contrasts in every theme.
 */
describe('Existing project buttons stay readable in every theme', () => {
  it('never put white text on the accent background', () => {
    const dir = new URL('./', import.meta.url);
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.tsx'))) {
      const lines = readFileSync(new URL(name, dir), 'utf8').split(/\r?\n/);
      lines.forEach((line, i) => assert.ok(!(line.includes('bg-[var(--accent)]') && line.includes('text-white')), `${name}:${i + 1} puts white text on the accent colour`));
    }
  });
});
