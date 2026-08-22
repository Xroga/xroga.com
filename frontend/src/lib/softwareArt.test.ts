import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { SOFTWARE_ART } from './softwareArt';

/**
 * Guards for the `/software` artwork map.
 *
 * The map is remote URLs rather than files in `public/`, which introduces two failure
 * modes that a build will never catch:
 *
 * 1. **A host that is not allowed.** `next/image` refuses any remote host missing from
 *    `images.remotePatterns`, and it fails at request time, not at build time. CI stays
 *    green and the page renders with empty frames.
 * 2. **A slot that silently loses its image.** Every section reads from this one map, so
 *    a dropped or duplicated entry means a section quietly falls back to its scrim over
 *    nothing. Nothing else in the codebase would notice.
 *
 * The URLs themselves are not fetched here. A network call would make this test flaky and
 * dependent on an outside host, and a dead link is an operational problem rather than one
 * a unit test should assert. What is checked is everything that can be checked offline.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const NEXT_CONFIG = read('../../next.config.mjs');
const LANDING = read('../components/marketing/SoftwareLanding.tsx');
const TABS = read('../components/marketing/SoftwareFeatureTabs.tsx');

/** Every section that must have artwork, in the order it appears on the page. */
const SLOTS = [
  'hero',
  'problem',
  'aiField',
  'build',
  'core',
  'repository',
  'cta',
  'footer',
] as const;

test('every section slot has artwork', () => {
  assert.deepEqual(Object.keys(SOFTWARE_ART), [...SLOTS]);
  for (const slot of SLOTS) {
    const url = SOFTWARE_ART[slot];
    assert.ok(url && url.length > 0, `${slot} has no image`);
  }
});

test('no two sections share the same image', () => {
  const seen = new Map<string, string>();
  for (const slot of SLOTS) {
    const url = SOFTWARE_ART[slot];
    const first = seen.get(url);
    assert.equal(
      first,
      undefined,
      `${slot} reuses the image already assigned to ${first} — a positional mapping that repeats is almost always a copy/paste slip`,
    );
    seen.set(url, slot);
  }
});

test('every image host is allowed by next.config, or the image cannot load', () => {
  const allowed = new Set(
    [...NEXT_CONFIG.matchAll(/hostname:\s*'([^']+)'/g)].map((m) => m[1]),
  );
  for (const slot of SLOTS) {
    const url = SOFTWARE_ART[slot];
    if (!url.startsWith('http')) continue; // a local file under public/ needs no pattern
    const { protocol, hostname } = new URL(url);
    assert.equal(protocol, 'https:', `${slot} must be served over https`);
    assert.ok(
      allowed.has(hostname),
      `${slot} points at ${hostname}, which is not in images.remotePatterns — next/image will refuse it at request time while the build stays green`,
    );
  }
});

test('both components read the shared map rather than their own copies', () => {
  // The bento is a client component and the page is a server one, so the URL is easy to
  // duplicate across the two. A second copy would drift the moment the order changed.
  for (const [name, source] of [['SoftwareLanding', LANDING], ['SoftwareFeatureTabs', TABS]] as const) {
    assert.ok(
      source.includes("from '@/lib/softwareArt'"),
      `${name} must import the shared artwork map`,
    );
    assert.ok(
      !/i\.postimg\.cc|https:\/\/[^'"]+\.(png|jpe?g|webp)/.test(source),
      `${name} must not hardcode an image URL; add it to softwareArt.ts instead`,
    );
  }
});

test('every slot is actually rendered somewhere', () => {
  const source = LANDING + TABS;
  for (const slot of SLOTS) {
    assert.ok(
      new RegExp(`(ART|SOFTWARE_ART)\\.${slot}\\b`).test(source),
      `${slot} is defined but never rendered — either wire it up or remove it`,
    );
  }
});
