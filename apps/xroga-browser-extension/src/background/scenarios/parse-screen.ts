// The screen parsed the OmniParser way on a real painted interface: numbered regions from the picture, the words of the picture read on the device, each word given to the region that
// holds it. Checked against what the page itself says it painted (its own drawing calls), so the recognised words and their places are verified, not assumed.
import type { Result } from '@src/browser-control';
import { describeScreen, parseScreen, type MarkBox } from '@src/agent/screen-parse';
import { recognizeImage } from '../../extension/ocr';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { sleep } from '../checks/helpers';
import { defineScenario, outcome } from './registry';

type Shot = { base64?: string; mimeType?: string; width?: number; height?: number; marks?: MarkBox[] };

defineScenario({
  id: 'S4-parse-screen',
  set: 'C',
  title: 'parse_screen gives numbered regions with their words on a painted menu bar',
  covers: 'marks come back as boxes with the screenshot; the on-device text recognition reads the menu words; the join labels regions with their words and the places agree with what the page painted',
  async run(ctx) {
    await ctx.open(`${FIXTURE_ORIGIN}/painted-menus.html?seed=1`);
    await ctx.call('navigate', { action: 'reload' });
    await sleep(600);
    const marked = (await ctx.call('screenshot', { marks: true })) as Result;
    const plain = (await ctx.call('screenshot', {})) as Result;
    const m = marked.data as Shot | undefined;
    const p = plain.data as Shot | undefined;
    if (!m?.marks?.length || !p?.base64 || !p.width || !p.height) throw new Error('no marks or no picture: ' + (marked.text ?? '').slice(0, 200));
    const read = await recognizeImage(p.base64, p.mimeType ?? 'image/png', 'eng');
    const entries = parseScreen(m.marks, read.lines, { width: p.width, height: p.height });
    const list = describeScreen(entries);
    // What the page says it painted, with places: «Tools» [0.052, 0.034] ...
    const painted = new Map<string, [number, number]>();
    for (const x of (marked.text ?? '').matchAll(/«([^»]+)»\s*\[([\d.]+),\s*([\d.]+)\]/g)) painted.set(x[1]!.toLowerCase(), [Number(x[2]), Number(x[3])]);
    const wanted = ['tools', 'effects', 'edit'].filter(w => painted.has(w));
    const found = wanted.map(w => {
      const [px, py] = painted.get(w)!;
      return entries.some(e => e.text.toLowerCase().includes(w) && Math.abs(e.at[0] - px) < 0.08 && Math.abs(e.at[1] - py) < 0.08);
    });
    return outcome(
      'marks arrive as boxes; the words Tools, Effects and Edit, when the page painted them, are found by the parse at their painted places',
      JSON.stringify({ marks: m.marks.length, lines: read.lines.length, wanted, found, list: list.slice(0, 500) }),
      m.marks.length > 3 && read.lines.flatMap(l => l.words).length > 3 && wanted.length >= 2 && found.every(Boolean),
    );
  },
});
