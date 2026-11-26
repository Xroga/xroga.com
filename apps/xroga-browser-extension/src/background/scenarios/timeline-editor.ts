// A painted timeline editor class: the outline names one clip with its start and end (as a layer list does), everything else is canvas. The generic
// canvas primitives (click at a fraction, key, drag between fractions) must split a clip at the playhead and move the second part. The verdict is the
// editor's own state (window.clips), not a receipt.
import type { Result } from '@src/browser-control';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { evaluate, sleep } from '../checks/helpers';
import { defineScenario, outcome } from './registry';

const clips = (tabId: number) => evaluate<string>(tabId, undefined, 'JSON.stringify(window.clips.map(k => [k.id, Math.round(k.s), Math.round(k.e)]))');

defineScenario({
  id: 'TL-1-timeline-split-and-move',
  set: 'C',
  title: 'split a clip at the playhead and move the second part on a painted timeline',
  covers: 'canvas click sets the playhead, key s splits, drag moves a clip by a derived distance; fractions come from the clip times the app lists',
  async run(ctx) {
    const tabId = await ctx.open(`${FIXTURE_ORIGIN}/timeline-editor.html`);
    await sleep(300);
    // The outline says Clip A runs 100 to 400 (thousandths of the width); the track is the middle band. Playhead to 250 is inside the clip.
    const steps: Array<[string, Record<string, unknown>]> = [
      ['click', { action: 'click', at: [0.25, 0.07], intent: 'move the playhead to 250' }],
      ['key', { action: 'key', key: 's', intent: 'split the clip at the playhead' }],
    ];
    const results: Array<{ step: string; ok: boolean }> = [];
    for (const [name, args] of steps) results.push({ step: name, ok: ((await ctx.call('canvas', args)) as Result).ok });
    const afterSplit = await clips(tabId);
    // The second part starts at 250: drag from its middle (325) right by 100 units.
    const drag = (await ctx.call('canvas', { action: 'drag', at: [0.325, 0.55], to: [0.425, 0.55], intent: 'move the second clip right' })) as Result;
    const afterMove = await clips(tabId);
    const ok = results.every(r => r.ok) && drag.ok && afterSplit === '[["A",100,250],["A2",250,400]]' && afterMove === '[["A",100,250],["A2",350,500]]';
    return outcome(
      'split at 250 gives A 100-250 and A2 250-400; dragging A2 by 100 gives 350-500',
      JSON.stringify({ results, drag: drag.ok, afterSplit, afterMove }),
      ok,
    );
  },
});
