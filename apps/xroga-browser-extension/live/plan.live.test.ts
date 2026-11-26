// Real DeepSeek, simulated page: does the model plan a substantial task and skip the plan for a trivial one?
import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { apiKey, runLive, type Scenario } from './harness';

const REPEATS = Number(process.env.LIVE_REPEATS ?? 3);
const ADMIN = ['heading "Store admin"', 'link "Products"', 'link "Collections"', 'link "Inventory"', 'button "Add product"', 'searchbox "Search"'].join('\n');
const COMPLEX: Scenario = {
  request: 'In my open store admin, add three products: Mug at 12, Cap at 15 and Bag at 30, each with 10 in stock, put all three in a new collection called Summer, then check that the collection lists all three.',
  url: 'https://shop.example.test/admin', title: 'Store admin', outline: ADMIN,
  handlers: { click: () => ({ ok: true, text: 'click · changed' }), fill_form: () => ({ ok: true, text: 'fill_form · done' }), wait: () => ({ ok: true, text: 'wait · met' }) },
  turnCap: 8,
};
const SIMPLE: Scenario = {
  request: 'What is the heading of this page?',
  url: 'https://shop.example.test/admin', title: 'Store admin', outline: ADMIN, turnCap: 4,
};

const out: Record<string, unknown> = {};
const live = apiKey() ? describe : describe.skip;
live('live DeepSeek planning', () => {
  for (const [name, sc] of Object.entries({ complex: COMPLEX, simple: SIMPLE })) {
    it(`${name}: records whether plan is used`, async () => {
      const runs = [];
      for (let i = 0; i < REPEATS; i++) runs.push(await runLive(sc));
      out[name] = runs.map(r => ({ tools: r.calls.map(c => `${c.turn}:${c.tool}`), planned: r.calls.some(c => c.tool === 'plan'), turns: r.modelTurns, wallMs: r.wallMs, planResult: r.calls.find(c => c.tool === 'plan')?.result?.slice(0, 300) }));
      mkdirSync('live/results', { recursive: true });
      writeFileSync('live/results/plan.json', JSON.stringify(out, null, 2));
      expect(runs.length).toBe(REPEATS);
    }, 600_000);
  }
});
