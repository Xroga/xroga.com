import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

/**
 * Guards for the homepage header control and the community button labels.
 *
 * The header used to be two detached buttons. They now share one segmented
 * surface divided by a hairline, which is a look that depends on two things
 * holding together:
 *
 * **The group owns the ground, the segments do not.** Two nested backgrounds on
 * one control read as buttons inside a box rather than as one segmented control.
 *
 * **`overflow: hidden` is the trap.** It is the obvious way to keep a segment's
 * hover ground inside the rounded ends, and it silently clips the theme menu,
 * which is absolutely positioned below the trigger. The end segments carry the
 * radius themselves instead, driven by a custom property so the mobile variant
 * can round the group and its ends together.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const PAGE = read('../app/page.tsx');
const SWITCHER = read('../components/companion/HomepageThemeSwitcher.tsx');
const CSS = read('../styles/homepage-coding.css');

/** The declarations of the rule this selector belongs to, comments stripped. */
function ruleBody(selector: string): string {
  const code = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const match = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[,{]`).exec(code);
  assert.ok(match, `${selector} is missing from the sheet`);
  const open = code.indexOf('{', match.index);
  return code.slice(open + 1, code.indexOf('}', open));
}

test('the community buttons name destinations, not instructions', () => {
  for (const [label, gone] of [
    ['>\n              Community\n', 'Open Community'],
    ['>\n              Feedback\n', 'Share Feedback'],
    ['>\n              Docs\n', 'Read the docs'],
  ] as const) {
    assert.ok(PAGE.includes(label), `the shortened label is missing: ${label.trim()}`);
    assert.ok(!PAGE.includes(gone), `the old label "${gone}" is still on the page`);
  }
});

test('theme and the account control share one group', () => {
  assert.match(PAGE, /<div className="xv-hc-headgroup">/, 'the segmented group is missing');
  const at = PAGE.indexOf('<div className="xv-hc-headgroup">');
  const group = PAGE.slice(at, PAGE.indexOf('</div>', PAGE.indexOf('xv-hc-headgroup__seg', at)));
  assert.ok(group.includes('<HomepageThemeSwitcher />'), 'theme belongs in the group');
  assert.ok(group.includes('xv-hc-headgroup__seg'), 'the account control belongs in the group');
  assert.match(SWITCHER, /xv-hc-seg-label">Theme</, 'the theme segment needs a visible label');
});

test('the conversion action stays out of the group', () => {
  // Signed out, that button is the page's primary action. A neutral segment of
  // equal weight beside Theme would cost the homepage that emphasis.
  //
  // Read from comment-stripped source: the JSX comment above the group explains
  // this decision and names the button, so a raw search finds the prose first and
  // concludes the button sits before the group.
  const markup = PAGE.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  const at = markup.indexOf('Get Started');
  assert.notEqual(at, -1, 'the sign-up action is gone entirely');
  const groupEnd = markup.indexOf('</div>', markup.indexOf('xv-hc-headgroup__seg'));
  assert.ok(at > groupEnd, 'the sign-up action has been folded into the segmented group');
  // A window either side of the match: the first occurrence is the `aria-label`,
  // which sits above the `className` rather than below it.
  assert.match(
    markup.slice(at - 200, at + 400),
    /xv-hc-btn-primary/,
    'it must keep the primary treatment',
  );
});

test('the group owns the ground and the segments do not', () => {
  const group = ruleBody('.xv-home-coding .xv-hc-headgroup');
  assert.match(group, /background:\s*var\(--hc-surface-solid\)/, 'the group carries the theme surface');
  assert.match(group, /color:\s*var\(--hc-ink\)/, 'the group carries the theme ink');

  const seg = ruleBody('.xv-home-coding .xv-hc-headgroup__seg');
  assert.match(seg, /background:\s*transparent/, 'a segment must not paint its own ground at rest');
  assert.match(seg, /border:\s*0/, 'a segment must not carry its own border');
});

test('the divider follows the theme rather than one palette', () => {
  // Passed raw: ruleBody escapes regex metacharacters itself, so pre-escaping
  // here would search for literal backslashes.
  const body = ruleBody('.xv-home-coding .xv-hc-headgroup > * + *');
  assert.match(
    body,
    /border-left:\s*1px solid color-mix\(in srgb, var\(--hc-ink\)/,
    'the hairline must be theme ink, so it inverts on the dark themes',
  );
});

test('the group never clips the theme menu', () => {
  // This is the whole reason the end segments carry their own radius.
  const group = ruleBody('.xv-home-coding .xv-hc-headgroup');
  assert.ok(!/overflow:\s*hidden/.test(group), 'overflow:hidden would clip the theme menu open below it');

  const code = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(code, /\.xv-hc-headgroup > :first-child[\s\S]{0,200}border-start-start-radius/, 'the leading end needs its own radius');
  assert.match(code, /\.xv-hc-headgroup > :last-child[\s\S]{0,200}border-start-end-radius/, 'the trailing end needs its own radius');
});

test('the compact variant rounds the group and its ends together', () => {
  const code = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const at = code.indexOf('@media (max-width: 640px)', code.indexOf('.xv-hc-headgroup'));
  assert.notEqual(at, -1, 'there is no compact variant');
  const block = code.slice(at, at + 900);
  // Setting `border-radius` alone would round the group and leave pill-shaped
  // ends on the segments inside it.
  assert.match(block, /--hg-radius:\s*0\.85rem/, 'the compact radius must go through the custom property');
  assert.match(block, /\.xv-hc-seg-label[\s\S]{0,200}clip:\s*rect\(0, 0, 0, 0\)/, 'labels should be hidden accessibly, not removed');
});
