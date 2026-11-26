// Benchmark: how quickly does a real DeepSeek reach the batched fill on a simple public-form task? Real model, SIMULATED page (the page answers instantly).
// Measures, per run: model turns until the first fill_form, wall time until then, total turns used, and tool calls before the fill. Writes live/results/bench-form.json.
import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { apiKey, runLive } from './harness';

const RUNS = Number(process.env.LIVE_REPEATS ?? 10);
const live = apiKey() ? describe : describe.skip;
const outline = ['textbox "Customer name:"', 'textbox "Telephone:"', 'textbox "E-mail address:"', 'radio "Small"', 'radio "Medium"', 'radio "Large"', 'checkbox "Bacon"', 'checkbox "Extra Cheese"', 'checkbox "Onion"', 'checkbox "Mushroom"', 'textbox "Preferred delivery time:"', 'textbox "Delivery instructions:"', 'button "Submit order"'].join('\n');
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]!; };

live('form benchmark (real DeepSeek, simulated page)', () => {
  it(`runs ${RUNS} times`, async () => {
    const rows: Array<{ turnsToFill: number | null; msToFill: number | null; callsBeforeFill: number; totalTurns: number; wallMs: number; first: string }> = [];
    for (let i = 0; i < RUNS; i++) {
      const r = await runLive({
        request: 'On my open httpbin.org tab, order a pizza: customer name Grace Hopper, telephone 555-0199, email grace@example.test, Medium size, toppings Bacon and Mushroom, delivery time 18:30, instructions "Ring the bell twice", then submit the order once.',
        url: 'https://httpbin.org/forms/post', title: '', outline, turnCap: 6,
      });
      const fillIdx = r.calls.findIndex(c => c.tool === 'fill_form' || c.tool === 'batch');
      const sumMs = fillIdx >= 0 ? r.calls.slice(0, fillIdx + 1).reduce((n, c) => n + c.ms, 0) : null;
      rows.push({ turnsToFill: fillIdx >= 0 ? r.calls[fillIdx]!.turn : null, msToFill: sumMs, callsBeforeFill: fillIdx < 0 ? r.calls.length : fillIdx, totalTurns: r.modelTurns, wallMs: r.wallMs, first: r.calls[0]?.tool ?? '' });
    }
    const filled = rows.filter(r => r.turnsToFill !== null);
    const summary = {
      runs: rows.length, filledWithin6Turns: filled.length,
      turnsToFill: { p50: pct(filled.map(r => r.turnsToFill!), 0.5), p95: pct(filled.map(r => r.turnsToFill!), 0.95) },
      msToFill: { p50: pct(filled.map(r => r.msToFill!), 0.5), p95: pct(filled.map(r => r.msToFill!), 0.95) },
      callsBeforeFill: { p50: pct(rows.map(r => r.callsBeforeFill), 0.5), p95: pct(rows.map(r => r.callsBeforeFill), 0.95) },
      firstTool: rows.reduce<Record<string, number>>((m, r) => ((m[r.first] = (m[r.first] ?? 0) + 1), m), {}),
    };
    mkdirSync('live/results', { recursive: true });
    writeFileSync('live/results/bench-form.json', JSON.stringify({ summary, rows }, null, 2));
    expect(rows.length).toBe(RUNS);
  }, 1_200_000);
});
