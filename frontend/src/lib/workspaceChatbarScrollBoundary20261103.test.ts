import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('conversation content clips before the transparent dock and adds a scroll-only upper glow', () => {
  const dock = read('../components/terminal/TerminalDock.tsx');
  const messageLog = read('../components/terminal/SwarmMessageLog.tsx');
  const css = read('../app/globals.css');

  assert.match(dock, /data-response-scrolled=\{/);
  assert.match(dock, /messages\.length > 0 && showJumpToLatest/);
  assert.match(dock, /calc\(\$\{keyboardOffset\}px \+ max\(14px, env\(safe-area-inset-bottom\)\)\)/);
  assert.match(
    messageLog,
    /if \(atBottom\)[\s\S]*setShowJumpToLatest\(false\);[\s\S]*else \{[\s\S]*setShowJumpToLatest\(true\);/,
  );
  assert.doesNotMatch(messageLog, /else if \(loading\)[\s\S]*setShowJumpToLatest\(true\);/);
  assert.match(css, /\.xv-terminal-scroll\[data-conversation='true'\]\s*\{[^}]*clip-path:/s);
  assert.match(css, /data-workspace-state='conversation'\][^}]*background:\s*transparent !important/s);
  assert.match(
    css,
    /data-workspace-state='conversation'\][^}]*padding-bottom:\s*0;/s,
  );
  assert.match(
    css,
    /data-workspace-state='conversation'\]\s+\.xv-terminal-dock-inner\s*\{[^}]*padding-bottom:\s*0 !important/s,
  );
  assert.match(css, /data-response-scrolled='true'[^}]*box-shadow:/s);
  assert.doesNotMatch(
    css,
    /data-workspace-state='conversation'\][^}]*background:\s*var\(--terminal-ui-surface/s,
  );
});
