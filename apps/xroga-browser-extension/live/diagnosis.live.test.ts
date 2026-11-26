// A save button covered by a dialog: does the live model see the strategy note and the failure-diagnosis directive, and does it close the dialog instead of
// repeating the covered click? Real DeepSeek, SIMULATED page.
import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { apiKey, runLive } from './harness';
import type { FakeHandler } from '@src/agent/testing/fake-layer';

const REPEATS = Number(process.env.LIVE_REPEATS ?? 5);
const live = apiKey() ? describe : describe.skip;

function covered(hidden = false) {
  let open = true; let saved = 0; const log: string[] = [];
  const outline = () => ['textbox "Name"', 'button "Save"', ...(open && !hidden ? ['dialog "Cookie notice"', '  button "Close"'] : [])].map((l, i) => (/"/.test(l) && !l.startsWith('dialog') ? `[e${i + 1}] ${l}` : l)).join('\n');
  const handlers: Record<string, FakeHandler> = {
    snapshot: () => ({ ok: true, text: outline(), page: { tabId: 1, url: 'https://shop.example.test/profile', title: 'Profile', rev: 3 } as never }),
    click: args => {
      const t = (args.target ?? {}) as { name?: string; ref?: string };
      const name = t.name ?? (t.ref === 'e2' ? 'Save' : t.ref === 'e4' ? 'Close' : '');
      log.push(`click:${name || t.ref}`);
      if (name === 'Close') { open = false; return { ok: true, text: 'click · dialog closed' }; }
      if (name === 'Save') {
        if (open) return { ok: false, text: 'button «Save» is covered by dialog «Cookie notice» at its click point. Do not repeat the same click.', error: { code: 'OBSCURED', message: 'covered by dialog', delivered: false } } as never;
        saved++; return { ok: true, text: 'click · saved' };
      }
      return { ok: true, text: 'click' };
    },
    fill_form: () => ({ ok: true, text: 'fill_form · set Name' }),
    // Only a deliberate search finds the overlay when it is hidden from the outline.
    find: () => ({ ok: true, text: open ? 'found: dialog «Cookie notice» with button «Close» (covers the page)' : 'found: nothing' }),
  };
  return { handlers, outline, stats: () => ({ saved, open, log }) };
}

live('diagnosis and strategy notes with a live model (simulated page)', () => {
  for (const hidden of [false, true]) it(`${hidden ? 'overlay hidden from the outline' : 'overlay visible'}: runs ${REPEATS} times`, async () => {
    const rows = [];
    for (let i = 0; i < REPEATS; i++) {
      const sim = covered(hidden);
      const r = await runLive({ request: 'On my open shop.example.test tab, set the Name to Ada Lovelace and press Save once.', url: 'https://shop.example.test/profile', title: 'Profile', outline: sim.outline(), handlers: sim.handlers, turnCap: 10 });
      const st = sim.stats();
      const coveredSaves = st.log.filter(l => l === 'click:Save' || l === 'click:e2').length;
      rows.push({ saved: st.saved, dialogClosed: !st.open, coveredSaveAttempts: coveredSaves, turns: r.modelTurns, wallMs: r.wallMs, strategyNote: r.appNotes.some(n => n.includes('Method chosen')), diagnosisNote: r.appNotes.some(n => n.includes('Diagnosis:')), notes: r.appNotes.map(n => n.slice(0, 160)), log: st.log });
    }
    mkdirSync('live/results', { recursive: true });
    writeFileSync(`live/results/diagnosis-${hidden ? 'hidden' : 'visible'}.json`, JSON.stringify(rows, null, 2));
    expect(rows.length).toBe(REPEATS);
  }, 900_000);
});
