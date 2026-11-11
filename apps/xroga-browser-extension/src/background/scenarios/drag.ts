// Drag and drop: a pointer-driven handle moved onto a target, and a native HTML5 drag dropped on a zone. Both are checked on the
// page's own state, not on the tool's receipt.
import type { Result, SnapshotData } from '@src/browser-control';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { evaluate, sleep } from '../checks/helpers';
import { defineScenario, outcome } from './registry';
import type { ScenarioContext } from './registry';

const PAGE = `${FIXTURE_ORIGIN}/d-drag.html`;
const err = (r: Result) => (r.ok ? 'ok' : `${r.error?.code}/${r.error?.delivered}`);
const state = (tabId: number) => evaluate<{ pointer: string; native: string; moves: number }>(tabId, undefined, 'window.dragState');

async function open(ctx: ScenarioContext) {
  const tabId = await ctx.open(PAGE);
  await sleep(300);
  const snap = (await ctx.call('snapshot', { window: 'page' })) as Result<SnapshotData>;
  return { tabId, snap };
}

const ref = (snap: Result, pattern: RegExp): string => {
  const line = (snap.page?.snapshot ?? '').split('\n').find(l => pattern.test(l));
  const found = line && /\[(\w+)\]/.exec(line)?.[1];
  if (!found) throw new Error(`no line matching ${pattern} in:\n${snap.page?.snapshot ?? snap.text}`);
  return found;
};

defineScenario({
  id: 'DND-1-pointer-drag',
  set: 'C',
  title: 'drag a handle that follows the pointer onto a target',
  covers: 'a press, a stepped move and a release reach the page as real pointer events, and the page ends on the target',
  async run(ctx) {
    const { tabId, snap } = await open(ctx);
    const r = await ctx.call('drag', { from: { ref: ref(snap, /button "Handle"/) }, to: { ref: ref(snap, /button "Target"/) } });
    const s = await state(tabId);
    return outcome('ok; the page reports the handle over the target after several moves', `${err(r)}; ${JSON.stringify(s)}`, r.ok && s.pointer === 'over target' && s.moves >= 5);
  },
});

defineScenario({
  id: 'DND-2-native-drop',
  set: 'C',
  title: 'drag a draggable element and drop it on a drop zone (native HTML5 drag and drop)',
  covers: 'a native drag is intercepted and finished with drag events, so the zone receives the drop and its data',
  async run(ctx) {
    const { tabId, snap } = await open(ctx);
    const r = await ctx.call('drag', { from: { ref: ref(snap, /button "Card"/) }, to: { ref: ref(snap, /button "Drop zone"/) } });
    await sleep(200);
    const s = await state(tabId);
    return outcome('ok; the zone reports "dropped card"', `${err(r)}; ${JSON.stringify(s)}`, r.ok && s.native === 'dropped card');
  },
});

defineScenario({
  id: 'DND-3-unknown-target',
  set: 'C',
  title: 'a drag to a target that does not exist is refused and nothing moves',
  covers: 'the destination is resolved before the press, so a missing one leaves the page untouched',
  async run(ctx) {
    const { tabId, snap } = await open(ctx);
    const r = await ctx.call('drag', { from: { ref: ref(snap, /button "Handle"/) }, to: { role: 'button', name: 'No such control' } });
    const s = await state(tabId);
    return outcome('an error, with no pointer movement', `${err(r)}; ${JSON.stringify(s)}`, !r.ok && s.moves === 0 && s.pointer === 'idle');
  },
});
