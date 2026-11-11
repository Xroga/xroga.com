import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compactSchema, searchGuidance, withFullSchemas } from './localBrowser.js';

test('a tool is described to the model with exactly the arguments it accepts', () => {
  const compact = compactSchema({
    type: 'object', required: ['query', 5],
    properties: {
      query: { type: 'string', description: '  Name   to search for.\n' + 'x'.repeat(400) },
      order_by: { type: 'string', enum: Array.from({ length: 30 }, (_, i) => `v${i}`), default: 'name' },
      ids: { type: 'array', items: { type: 'string' }, default: 'y'.repeat(200) },
    },
  }) as { properties: Record<string, { description?: string; enum?: string[]; default?: unknown; items?: unknown }>; required: string[] };
  assert.deepEqual(Object.keys(compact.properties), ['query', 'order_by', 'ids']);
  assert.deepEqual(compact.required, ['query']);
  assert.ok(compact.properties.query.description!.length <= 180 && !compact.properties.query.description!.includes('\n'));
  assert.equal(compact.properties.order_by.enum!.length, 12);
  assert.equal(compact.properties.order_by.default, 'name');
  assert.equal(compact.properties.ids.default, undefined);
  assert.deepEqual(compact.properties.ids.items, { type: 'string' });
  assert.equal(compactSchema({ schemaRef: 'abc' }), undefined);
  assert.equal(compactSchema(undefined), undefined);
});

test('a tool whose search result has no parameter list gets its full definition, and a failed lookup changes nothing', async () => {
  const asked: string[] = [];
  const details = async (slug: string) => {
    asked.push(slug);
    if (slug === 'B_FAILS') throw new Error('provider down');
    return { inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } };
  };
  const tools = [
    { slug: 'A_HAS_SCHEMA', inputSchema: { type: 'object', properties: {} } },
    { slug: 'B_FAILS', inputSchema: { schemaRef: 'r' } },
    { slug: 'C_NEEDS_IT', inputSchema: undefined },
  ];
  const out = await withFullSchemas(tools, details, undefined);
  assert.deepEqual(asked.sort(), ['B_FAILS', 'C_NEEDS_IT']);
  assert.deepEqual(out[0], tools[0]);
  assert.deepEqual(out[1], tools[1]);
  assert.deepEqual((out[2].inputSchema as { required: string[] }).required, ['id']);
  assert.deepEqual(await withFullSchemas(tools, undefined, undefined), tools);
});

test("the provider's plan, pitfalls, notes and connection status reach the model, bounded", () => {
  const brief = searchGuidance({
    skill: { primaryToolSlugs: [], relatedToolSlugs: [], recommendedPlanSteps: Array.from({ length: 20 }, (_, i) => `step ${i} ` + 'z'.repeat(400)),
      knownPitfalls: ['Pass a channel ID, not a name.'] },
    guidance: 'Search by file name.\n  Then read the sheet.',
    toolkits: [{ toolkit: 'googlesheets', connected: true, statusMessage: 'Active connection.' }, { toolkit: 'gmail', connected: false }],
  });
  assert.equal(brief.plan!.length, 8);
  assert.ok(brief.plan!.every(step => step.length <= 240));
  assert.deepEqual(brief.pitfalls, ['Pass a channel ID, not a name.']);
  assert.equal(brief.guidance, 'Search by file name. Then read the sheet.');
  assert.deepEqual(brief.apps, [{ app: 'googlesheets', connected: true, note: 'Active connection.' }, { app: 'gmail', connected: false }]);
  assert.deepEqual(searchGuidance({ toolkits: [] }), {});
});
