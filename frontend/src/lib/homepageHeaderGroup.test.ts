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

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
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
  const body = ruleBody('.xv-home-coding .xv-hc-headgroup > * + *::before');
  assert.match(
    body,
    /background:\s*color-mix\(in srgb, var\(--hc-ink\)/,
    'the hairline must be theme ink, so it inverts on the dark themes',
  );
  // Centred in the gap rather than drawn on a segment edge: on an edge, the
  // inverted hover fill paints straight over it.
  assert.match(body, /left:\s*calc\(var\(--hg-gap\) \/ -2\)/, 'the divider belongs in the gap between segments');
});

test('hover inverts the segment', () => {
  const group = ruleBody('.xv-home-coding .xv-hc-headgroup');
  // One rule covers three themes: the fill is the theme ink, which is already
  // near-white on Gray and Black and near-black on White.
  assert.match(group, /--hg-hover-bg:\s*var\(--hc-ink\)/, 'the hover fill should be the theme ink');
  assert.match(group, /--hg-hover-ink:\s*var\(--hc-surface-solid\)/, 'the hover label should be the theme surface');

  const code = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  // Beige is the deliberate exception: its ink is a dark brown, which reads as a
  // smudge on the cream panel rather than as a state change.
  const beigeAt = code.indexOf('body.theme-beige .xv-home-coding .xv-hc-headgroup');
  assert.notEqual(beigeAt, -1, 'Beige needs its own hover fill');
  assert.match(code.slice(beigeAt, beigeAt + 200), /--hg-hover-bg:\s*#ffffff/, 'Beige hovers to white');

  const hover = ruleBody('.xv-home-coding .xv-hc-headgroup__seg:hover');
  assert.match(hover, /background:\s*var\(--hg-hover-bg\)/, 'hover must take the inverted fill');
  assert.match(hover, /color:\s*var\(--hg-hover-ink\)/, 'the label must invert with the fill, not stay put');

  // The open theme menu shows the same state, read from the attribute that
  // already expresses it rather than a second class that could drift from it.
  assert.match(code, /\.xv-home-theme-trigger\[aria-expanded='true'\]/, 'the open theme segment should look active');
});

test('the group never clips the theme menu', () => {
  const group = ruleBody('.xv-home-coding .xv-hc-headgroup');
  assert.ok(!/overflow:\s*hidden/.test(group), 'overflow:hidden would clip the theme menu open below it');
  // The segments are inset inside the group's padding, so their own radius keeps
  // the inverted fill off the group's corners without clipping anything.
  assert.match(group, /padding:\s*[\d.]+rem/, 'the group needs inner padding to inset its segments');
  const seg = ruleBody('.xv-home-coding .xv-hc-headgroup__seg');
  assert.match(seg, /border-radius:\s*var\(--hg-seg-radius\)/, 'each segment is a rounded rectangle of its own');
});

test('the inner radius stays tighter than the outer one', () => {
  // Matching them makes an inset segment look like it is bulging out of the
  // corner it sits in.
  const group = ruleBody('.xv-home-coding .xv-hc-headgroup');
  const outer = Number(/--hg-radius:\s*([\d.]+)rem/.exec(group)?.[1]);
  const inner = Number(/--hg-seg-radius:\s*([\d.]+)rem/.exec(group)?.[1]);
  assert.ok(Number.isFinite(outer) && Number.isFinite(inner), 'both radii should be set on the group');
  assert.ok(inner < outer, `inner radius ${inner}rem is not tighter than outer ${outer}rem`);
});

test('the compact variant tightens both radii together', () => {
  const code = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const at = code.indexOf('@media (max-width: 640px)', code.indexOf('.xv-hc-headgroup'));
  assert.notEqual(at, -1, 'there is no compact variant');
  const block = code.slice(at, at + 900);
  // Setting `border-radius` alone would round the group and leave the segments
  // inside it at the wider radius.
  const outer = Number(/--hg-radius:\s*([\d.]+)rem/.exec(block)?.[1]);
  const inner = Number(/--hg-seg-radius:\s*([\d.]+)rem/.exec(block)?.[1]);
  assert.ok(Number.isFinite(outer), 'the compact radius must go through the custom property');
  assert.ok(Number.isFinite(inner) && inner < outer, 'the segments must tighten with the group');
  assert.match(block, /\.xv-hc-seg-label[\s\S]{0,200}clip:\s*rect\(0, 0, 0, 0\)/, 'labels should be hidden accessibly, not removed');
});
