// Real DeepSeek, simulated page: does the model use verified site actions and site-published skills, and does it still act without them?
import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { apiKey, runLive, type Scenario } from './harness';
import { sha256Hex, type FetchLike } from '@src/agent/well-known-skills';

const REPEATS = Number(process.env.LIVE_REPEATS ?? 3);
const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

const ORDERS: Scenario = {
  request: 'On my open orders page, open Order 1002 and tell me what it shows.',
  url: 'http://127.0.0.1:8787/stale-and-slow.html?mode=stale',
  title: 'Orders',
  outline: ['heading "Orders"', 'button "Open Order 1001"', 'button "Open Order 1002"', 'button "Delete Order 1002"'].join('\n'),
  handlers: { click: () => ({ ok: true, text: 'click · changed' }), wait: () => ({ ok: true, text: 'wait · met' }), read: () => ({ ok: true, text: 'Order 1002 detail: 2 items' }) },
};

const SKILL = '---\nname: export-report\ndescription: Export the monthly report as CSV.\n---\nOpen Reports, choose Monthly, press Export CSV.';
async function publisher(): Promise<FetchLike> {
  const digest = `sha256:${await sha256Hex(enc(SKILL))}`;
  const files: Record<string, string> = {
    '/.well-known/agent-skills/index.json': JSON.stringify({ $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json', skills: [{ name: 'export-report', type: 'skill-md', description: 'Export the monthly report as CSV.', url: '/s/SKILL.md', digest }] }),
    '/s/SKILL.md': SKILL,
  };
  return async url => {
    const b = files[new URL(url).pathname];
    return b === undefined
      ? { ok: false, status: 404, headers: { get: () => null }, arrayBuffer: async () => enc('') }
      : { ok: true, status: 200, headers: { get: () => null }, arrayBuffer: async () => enc(b) };
  };
}

const out: Record<string, unknown> = {};
const live = apiKey() ? describe : describe.skip;
live('live DeepSeek with site knowledge', () => {
  it('orders: records whether site_action is used and the task still completes', async () => {
    const runs = [];
    for (let i = 0; i < REPEATS; i++) runs.push(await runLive(ORDERS));
    out.orders = runs.map(r => ({ tools: r.calls.map(c => `${c.turn}:${c.tool}`), turns: r.modelTurns, wallMs: r.wallMs, end: r.end, final: r.finalText }));
    mkdirSync('live/results', { recursive: true });
    writeFileSync('live/results/site.json', JSON.stringify(out, null, 2));
    expect(runs.length).toBe(REPEATS);
  }, 600_000);
  it('site publishes a skill: records find_skill/read_skill use', async () => {
    const f = await publisher();
    const s: Scenario = {
      request: 'On my open reports page, export the monthly report as CSV. Check for a site skill first.',
      url: 'https://app.example.test/reports', title: 'Reports',
      outline: ['heading "Reports"', 'link "Monthly"', 'link "Weekly"', 'button "Export CSV"'].join('\n'),
      handlers: { click: () => ({ ok: true, text: 'click · changed' }) }, siteFetch: f,
    };
    const runs = [];
    for (let i = 0; i < REPEATS; i++) runs.push(await runLive(s));
    out.published = runs.map(r => ({ tools: r.calls.map(c => `${c.turn}:${c.tool}`), turns: r.modelTurns, wallMs: r.wallMs, end: r.end, final: r.finalText }));
    mkdirSync('live/results', { recursive: true });
    writeFileSync('live/results/site.json', JSON.stringify(out, null, 2));
    expect(runs.length).toBe(REPEATS);
  }, 600_000);
});
