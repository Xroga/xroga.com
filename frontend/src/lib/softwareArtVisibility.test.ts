import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

/**
 * Guards for keeping the `/software` artwork visible.
 *
 * The page began with heavy scrims because they were doing two jobs at once: seaming each
 * section into the next, and keeping white type legible over whatever the image happened
 * to be. Sized for the second job, they buried the artwork.
 *
 * The scrims now only seam. Contrast comes from a shadow on the type itself. That split
 * is easy to undo by accident — one "just darken it slightly" and the images are veiled
 * again — so the ceilings are asserted rather than left to judgement.
 *
 * The last test is the one that came out of a real mistake. Thinning the scrims made
 * every section whose image failed to load render white type on a pale ground. The images
 * are served from a remote host, so that is a live failure mode, not a hypothetical.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const CSS = read('../styles/software-landing.css');
const LANDING = read('../components/marketing/SoftwareLanding.tsx');

/** The declarations of one rule, bounded by its own closing brace. */
function ruleBody(selector: string): string {
  const at = CSS.indexOf(`${selector} {`);
  assert.notEqual(at, -1, `${selector} is missing from the sheet`);
  const open = CSS.indexOf('{', at);
  return CSS.slice(open + 1, CSS.indexOf('}', open));
}

/** Every alpha value in a rule that paints over the artwork. */
function alphas(body: string): number[] {
  return [...body.matchAll(/rgba\([^)]*?,\s*([\d.]+)\s*\)/g)].map((m) => Number(m[1]));
}

const SCRIMS = [
  '.xsw-hero .xsw-scrim',
  '.xsw-problem .xsw-scrim',
  '.xsw-field .xsw-scrim',
  '.xsw-repo .xsw-scrim',
  '.xsw-cta .xsw-scrim',
];

test('no scrim veils the artwork it sits on', () => {
  // Opaque stops at the very top and bottom are the section seam and are allowed; what
  // is capped is the translucent wash across the middle, which is what hides an image.
  for (const selector of SCRIMS) {
    const body = ruleBody(selector);
    for (const alpha of alphas(body)) {
      assert.ok(
        alpha <= 0.36,
        `${selector} paints rgba(...) at ${alpha} over the image; above ~0.36 the artwork stops reading`,
      );
    }
  }
});

test('the light section keeps enough ground for its dark type', () => {
  // The inverse failure: .xsw-build sets dark text, so thinning its white wash too far
  // makes the copy unreadable rather than making the image clearer.
  const body = ruleBody('.xsw-build .xsw-scrim');
  const white = [...body.matchAll(/rgba\(255,\s*255,\s*255,\s*([\d.]+)\)/g)].map((m) => Number(m[1]));
  assert.ok(white.length > 0, '.xsw-build .xsw-scrim must keep a white wash for its dark type');
  assert.ok(
    Math.max(...white) >= 0.35,
    'the white wash under .xsw-build has dropped below what its dark text needs',
  );
});

test('nothing blurs the artwork', () => {
  // backdrop-filter on a panel smears whatever is behind it. The workspace tour's own
  // glass lives in homepage-coding.css and sits over no image, which is why the check is
  // scoped to this sheet.
  assert.ok(
    !CSS.includes('backdrop-filter'),
    'a backdrop-filter in software-landing.css blurs the image behind it',
  );
});

test('no image is dimmed below full opacity', () => {
  const dimmed = [...CSS.matchAll(/\.xsw-media img\s*\{([^}]*)\}/g)]
    .map((m) => /opacity:\s*([\d.]+)/.exec(m[1])?.[1])
    .filter((o): o is string => o !== undefined && Number(o) < 1);
  assert.deepEqual(dimmed, [], `images are dimmed at ${dimmed.join(', ')}; the artwork should render at full strength`);
});

test('type over artwork carries its own contrast', () => {
  // This is what replaced the heavy scrims. Without it, thinning them is just a
  // legibility regression.
  const body = ruleBody('.xsw-hero .xsw-h1,\n.xsw-hero .xsw-hero__lede,\n.xsw-hero .xsw-hero__foot,\n.xsw-problem .xsw-h2,\n.xsw-field .xsw-h2,\n.xsw-field__lede,\n.xsw-repo .xsw-h2,\n.xsw-repo .xsw-lede,\n.xsw-cta .xsw-h2,\n.xsw-cta__lede');
  assert.ok(body.includes('text-shadow'), 'headings over artwork must carry a text-shadow');
});

test('every section with white type has a ground beneath its image', () => {
  // The images come from a remote host. One failed request must not leave white text on
  // a pale background, so each of these sections paints a dark colour under the artwork.
  for (const selector of ['.xsw-hero', '.xsw-field', '.xsw-cta', '.xsw-problem', '.xsw-repo']) {
    const body = ruleBody(selector);
    const ground = /background:\s*(#[0-9a-fA-F]{3,8})/.exec(body)?.[1];
    assert.ok(
      ground,
      `${selector} sets white type over a remote image but paints no solid ground; if the image fails to load the copy becomes unreadable`,
    );
    // Dark enough that white type still reads on it alone.
    const hex = ground.length === 4
      ? ground.slice(1).split('').map((c) => parseInt(c + c, 16))
      : [1, 3, 5].map((i) => parseInt(ground.slice(i, i + 2), 16));
    const luminance = (0.2126 * hex[0] + 0.7152 * hex[1] + 0.0722 * hex[2]) / 255;
    assert.ok(
      luminance < 0.25,
      `${selector}'s ground ${ground} is too light to carry white type on its own`,
    );
  }
});

test('the artwork is served at a quality that survives a full-bleed crop', () => {
  const qualities = [...LANDING.matchAll(/quality=\{(\d+)\}/g)].map((m) => Number(m[1]));
  assert.ok(qualities.length >= 7, 'every section image should set an explicit quality');
  for (const q of qualities) {
    assert.ok(q >= 85, `quality ${q} is low for an image stretched across the viewport`);
  }
});
