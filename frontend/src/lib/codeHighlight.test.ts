import test from 'node:test';
import assert from 'node:assert/strict';
import {highlightCode,highlightLanguage,shouldHighlight,isLightColor,MAX_HIGHLIGHT_CHARACTERS,MAX_HIGHLIGHT_LINES} from './codeHighlight';

test('only allowlisted languages are highlighted, and common aliases resolve', () => {
  for (const [raw, id] of [['ts', 'typescript'], ['TypeScript', 'typescript'], ['language-js', 'javascript'], ['sh', 'bash'], ['py', 'python'], ['postgres', 'sql'], ['tsx title="a.tsx"', 'tsx'], ['json', 'json']] as const)
    assert.equal(highlightLanguage(raw), id, raw);
  for (const raw of ['', undefined, null, 'mermaid', 'xroga-ui', 'brainfuck', '<script>', '../../etc/passwd']) assert.equal(highlightLanguage(raw as string), null, String(raw));
});

test('very large blocks stay plain so the page stays fast', () => {
  assert.equal(shouldHighlight('x'.repeat(MAX_HIGHLIGHT_CHARACTERS), 'python'), true);
  assert.equal(shouldHighlight('x'.repeat(MAX_HIGHLIGHT_CHARACTERS + 1), 'python'), false);
  assert.equal(shouldHighlight('a\n'.repeat(MAX_HIGHLIGHT_LINES + 1), 'python'), false);
  assert.equal(shouldHighlight('', 'python'), false);
  assert.equal(shouldHighlight('print(1)', null), false);
});

test('the palette follows the theme: light text means a dark theme', () => {
  assert.equal(isLightColor('rgb(243, 244, 246)'), true);
  assert.equal(isLightColor('rgba(255, 255, 255, 0.9)'), true);
  assert.equal(isLightColor('rgb(32, 36, 43)'), false);
  assert.equal(isLightColor('not a color'), false);
});

test('real highlighting returns colored tokens and preserves the exact original text', async () => {
  const code = 'const total = items.reduce((sum, item) => sum + item.price, 0);\nconsole.log(`Total: ${total}`);\n';
  const lines = await highlightCode(code, 'ts');
  assert.ok(lines, 'highlighting should be available');
  assert.equal(lines.map(line => line.map(token => token.content).join('')).join('\n'), code.replace(/\n$/, '') + (code.endsWith('\n') ? '\n' : ''));
  const colored = lines.flat().filter(token => token.light && token.dark);
  assert.ok(colored.length > 5, 'tokens carry both a light and a dark color');
  assert.ok(colored.every(token => /^#[0-9a-f]{3,8}$/i.test(token.light!) && /^#[0-9a-f]{3,8}$/i.test(token.dark!)), 'colors are plain hex values');
});

test('script-like or unsupported code is never executed and falls back cleanly', async () => {
  assert.equal(await highlightCode('alert(1)', 'mermaid'), null);
  assert.equal(await highlightCode('x'.repeat(MAX_HIGHLIGHT_CHARACTERS + 5), 'python'), null);
  const sql = await highlightCode("SELECT id, name FROM users WHERE active = true; -- <img src=x onerror=alert(1)>", 'sql');
  assert.ok(sql);
  assert.ok(sql.flat().map(token => token.content).join('').includes('<img src=x onerror=alert(1)>'), 'markup in code stays literal text');
});
