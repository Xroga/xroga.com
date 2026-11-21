import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the native scrollport ends at the floating chatbar and the composer edge fades after scrolling', () => {
  const dock = read('../components/terminal/TerminalDock.tsx');
  const messageLog = read('../components/terminal/SwarmMessageLog.tsx');
  const css = read('../app/globals.css');

  assert.match(dock, /data-response-scrolled=\{/);
  assert.match(dock, /messages\.length > 0 && hasScrolledTranscript/);
  assert.match(dock, /transcript\.scrollTop > 1/);
  assert.match(dock, /'--xv-dock-bottom'/);
  assert.match(dock, /return \(\) => \{\s*root\.style\.removeProperty\('--xv-dock-bottom'\);\s*\};/);
  assert.match(dock, /calc\(\$\{keyboardOffset\}px \+ max\(14px, env\(safe-area-inset-bottom\)\)\)/);
  assert.match(
    messageLog,
    /setShowJumpToLatest\(root\.scrollHeight - root\.scrollTop - root\.clientHeight >= 140\);/,
  );
  assert.doesNotMatch(messageLog, /else if \(loading\)[\s\S]*setShowJumpToLatest\(true\);/);
  const scrollport = css.match(/\.xv-terminal-scroll\[data-conversation='true'\]\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(scrollport, /margin-block-end:\s*max\(0px, calc\(var\(--xv-dock-bottom, 14px\) - var\(--xv-pane-bottom, 0px\)\)\)/);
  assert.doesNotMatch(scrollport, /clip-path|--xv-chatbar-height/);
  assert.match(css, /\.xv-terminal-scroll\s*\{[^}]*padding-bottom:\s*calc\(var\(--xv-chatbar-height/s);
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
  assert.match(css, /data-response-scrolled='true'[^}]*::before\s*\{[^}]*height:\s*28px;[^}]*background:\s*linear-gradient\(to top, color-mix\(in srgb, var\(--terminal-ui-surface\)/s);
  assert.doesNotMatch(
    css,
    /data-workspace-state='conversation'\][^}]*background:\s*var\(--terminal-ui-surface/s,
  );
});

test('assistant replies use the composer inner inset at every pane width without moving user messages', () => {
  const messageLog = read('../components/terminal/SwarmMessageLog.tsx');
  assert.match(messageLog, /chromeless && msg\.role === 'assistant' && 'box-border ps-\[18px\]'/);
  assert.doesNotMatch(messageLog, /chromeless && msg\.role === 'user' && 'box-border ps-\[18px\]'/);
  assert.doesNotMatch(messageLog, /max-\[600px\]:ps-\[18px\]/);
});
