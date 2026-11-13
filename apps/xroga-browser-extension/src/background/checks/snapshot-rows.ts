// What the model is shown for a list whose rows each carry the same control (a Delete button on every row): the rows must be told apart.
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { layer } from '../layer';
import { attach } from '../spike-session';
import { defineCheck } from './registry';
import { assert, sleep, withTab } from './helpers';

defineCheck({
  name: 'snapshot-rows',
  title: 'Repeated controls name their row',
  description: 'Snapshots a list with an identical Delete and Toggle control on every row and checks that each says which row it belongs to.',
  async run() {
    const { session } = await layer();
    return withTab(`${FIXTURE_ORIGIN}/c-rows.html`, async tab => {
      await attach(tab.tabId);
      await sleep(500);
      const snap = await session.call('snapshot', {});
      assert(snap.ok, `snapshot failed: ${snap.text}`);
      const lines = (snap.page?.snapshot ?? '').split('\n');
      const buttons = lines.filter(l => /Delete todo/.test(l));
      const toggles = lines.filter(l => /Toggle Todo/.test(l));
      const rows = ['buy milk', 'call bank', 'write report'];
      const named = (list: string[]) => rows.filter(r => list.some(l => l.includes(`(in "${r}")`)));
      // Hovering one row reveals its Delete button: the result must say whose button it is.
      const target = /\[([a-zA-Z]+\d+)\]/.exec(toggles.find(l => l.includes('(in "write report")')) ?? '')?.[1];
      const hovered = target ? await session.call('hover', { target: { ref: target } }) : undefined;
      await sleep(300);
      const after = hovered ? await session.call('snapshot', {}) : undefined;
      const diffText = after?.page?.snapshot ?? '';
      const revealed = diffText.split('\n').filter(l => /Delete todo/.test(l));
      return { hoverText: (hovered?.text ?? '').slice(0, 1500), hoverPage: (hovered?.page?.snapshot ?? '').slice(0, 800), hoverRevealed: revealed, hoverNamesRow: revealed.some(l => l.includes('(in "write report")')), snapshotLines: lines.slice(0, 40), deleteLines: buttons, toggleLines: toggles, deleteRowsNamed: named(buttons), toggleRowsNamed: named(toggles) };
    });
  },
});
