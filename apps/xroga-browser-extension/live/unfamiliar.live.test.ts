// An application no skill matches. Does a real DeepSeek act on it (fill, submit) instead of saying it is unsupported or handing steps back? SIMULATED page.
import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { apiKey, runLive } from './harness';

const live = apiKey() ? describe : describe.skip;
const REPEATS = Number(process.env.LIVE_REPEATS ?? 5);
const outline = ['heading "Beacon Billing: New invoice"', 'textbox "Client"', 'textbox "Description"', 'spinbutton "Hours"', 'spinbutton "Rate per hour"', 'combobox "Currency"', 'checkbox "Send copy to me"', 'button "Create invoice"', 'link "Back to invoices"'].join('\n');

live('an application no skill matches (real DeepSeek, simulated page)', () => {
  it(`acts on it ${REPEATS} times`, async () => {
    const rows = [];
    for (let i = 0; i < REPEATS; i++) {
      let created = 0;
      const r = await runLive({
        request: 'In this open Beacon Billing tab, create an invoice for client Acme Ltd: 3 hours of consulting at 80 per hour, currency USD, and create it once.',
        url: 'https://app.beaconbilling.example/invoices/new', title: 'Beacon Billing', outline, turnCap: 8,
        handlers: { fill_form: args => { const fields = (args.fields as Array<{ target?: { name?: string; ref?: string }; value?: unknown }> | undefined) ?? []; return { ok: true, text: `fill_form · ${fields.length} fields set; read back equal to what was set: ${fields.map(f => `${f.target?.name ?? f.target?.ref} = ${String(f.value)}`).join('; ')}` }; }, click: args => { const n = String((args.target as { name?: string } | undefined)?.name ?? ''); if (/create invoice/i.test(n)) created++; return { ok: true, text: 'click · changed' }; } },
      });
      const text = r.finalText.toLowerCase();
      rows.push({ acted: r.calls.some(c => c.tool === 'fill_form' || c.tool === 'batch' || c.tool === 'type' || c.tool === 'click'), created, usedFindSkill: r.calls.some(c => c.tool === 'find_skill'), saidUnsupported: /not supported|unsupported|cannot|can't|unable|i can guide|you can/.test(text), tools: r.calls.map(c => c.tool).slice(0, 8), turns: r.modelTurns, final: r.finalText.slice(0, 160) });
    }
    mkdirSync('live/results', { recursive: true });
    writeFileSync('live/results/unfamiliar.json', JSON.stringify(rows, null, 2));
    expect(rows.length).toBe(REPEATS);
  }, 900_000);
});
