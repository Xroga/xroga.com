// A full-page screenshot of a page that loads more as it scrolls: the page is scrolled through first, so the picture holds all of it, and the reader's place is kept.
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { defineScenario, outcome } from './registry';

defineScenario({
  id: 'S3-full-page-lazy',
  set: 'C',
  title: 'a full-page screenshot of a page that loads on scroll shows every section',
  covers: 'lazy and appended content is loaded before the capture (idea: BrowserSkill full-page screenshot)',
  async run(ctx) {
    await ctx.open(`${FIXTURE_ORIGIN}/c-lazy-page.html`);
    const visible = await ctx.call('screenshot', {});
    const full = await ctx.call('screenshot', { fullPage: true });
    // The picture is taken at a smaller scale when a side would pass 1800 px: the page's height is the picture's height over its scale.
    const scale = Number(/scale ([\d.]+)/.exec(full.text)?.[1] ?? 1) || 1;
    const height = Math.round(Number(/×(\d+) px/.exec(full.text)?.[1] ?? 0) / scale);
    const viewH = Number(/×(\d+) px/.exec(visible.text)?.[1] ?? 0);
    return outcome(
      'the full-page picture is at least 3,500 px tall (eight sections of 480 px), far taller than the window',
      JSON.stringify({ visible: visible.text.slice(0, 120), full: full.text.slice(0, 120), height, viewH }),
      full.ok && height >= 3500 && viewH > 0 && height > viewH * 2,
    );
  },
});
