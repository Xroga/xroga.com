import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { ScriptedModel, resolveProfile } from '@src/llm';
import { activeBranch, appendEntry, createConversation } from '@src/store/conversations';
import { closeDb } from '@src/store/db';
import { AgentLoop } from '../loop';
import { toolsForRun, type AgentTool } from '../tools';
import { isAppsFirstRequest, appSearchQuery, APPS_FIRST_NOTE, RESEARCH_FIRST_NOTE } from '../routing';
import { DELEGATE_TOOL } from '../subagents';
import { ok } from '../testing/fake-layer';
import { FakeHost, FakeLayer } from '../testing/fake-layer';

afterEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
});

describe('where a request starts', () => {
  it.each([
    ['Use my connected Google Sheets app, not the browser. List my spreadsheets and tell me whether one named "Xroga Test" exists.', true],
    ['In my connected Google Sheets, add a row with the text hello', true],
    ['Add a row to my Google Sheet with the total', true],
    ['Read my Gmail inbox for invoices from last week', true],
    ['Use composio to list my Notion pages', true],
    ['Check my HubSpot CRM for new deals via the API', true],
    ['Create a draft post, without using the browser', true],
  ])('goes to the connected apps first: %s', (request, expected) => {
    expect(isAppsFirstRequest(request)).toBe(expected);
  });

  it.each([
    'Open xroga.com and read the heading',
    'Go to https://ads.google.com and update my approved draft',
    'Click the Pay button on this page',
    'What is the heading of the page?',
    'Summarize this page',
    'Fill out the form on the site and submit it',
    'Use my connected Google Sheets app, then open https://docs.google.com/spreadsheets and check the chart',
    'Scroll down and take a screenshot',
    'Research the best laptops and compare prices',
  ])('stays in the browser: %s', request => {
    expect(isAppsFirstRequest(request)).toBe(false);
  });
});

class WebLayer extends FakeLayer {
  async tabs() {
    return { tabs: [{ tabId: 1, url: 'https://www.google.com/', title: 'Google', active: true }], activeTabId: 1 } as Awaited<ReturnType<FakeLayer['tabs']>>;
  }
}

const pluginSearch: AgentTool = {
  name: 'plugin_search', source: 'agent', group: 'working', description: 'find app tools',
  parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
};

async function firstTurnOf(text: string, withPlugins: boolean, withDelegate = false, layerOverride?: FakeLayer) {
  const c = await createConversation({ mode: 'ask' });
  await appendEntry(c.id, { type: 'message', message: { role: 'user', parts: [{ type: 'text', text }] } });
  const layer = layerOverride ?? new WebLayer();
  const loop = new AgentLoop({
    conversationId: c.id, runId: 'r1',
    model: {
      ref: { providerId: 'p', model: 'm' }, chat: new ScriptedModel([]).chat(),
      profile: resolveProfile({ kind: 'openai-compatible', modelName: 'm' }), reasoning: 'none',
    },
    system: 'sys',
    tools: [...toolsForRun({ disabled: ['hover'], vision: false }), ...(withPlugins ? [pluginSearch] : []), ...(withDelegate ? [DELEGATE_TOOL] : [])],
    layer, host: new FakeHost(), signal: new AbortController().signal, emit: () => undefined, turnCap: 5,
  });
  await loop.firstTurn();
  const notes = (await activeBranch(c.id)).flatMap(e => (e.type === 'message' ? e.message.parts : [])).map(p => ('text' in p ? p.text : '')).join('\n');
  return { layer, notes };
}

describe('the first turn of an app request', () => {
  const request = 'Use my connected Google Sheets app, not the browser. List my spreadsheets.';

  it('reads no page and attaches nothing, and tells the model to start with the app tools', async () => {
    const { layer, notes } = await firstTurnOf(request, true);
    expect(layer.calls.map(c => c.tool)).toEqual([]);
    expect(notes).toContain(APPS_FIRST_NOTE);
  });

  it('is unchanged when the run has no connected-app tools: the page is read as before', async () => {
    const { layer, notes } = await firstTurnOf(request, false);
    expect(layer.calls.map(c => c.tool)).toContain('snapshot');
    expect(notes).not.toContain(APPS_FIRST_NOTE);
  });

  it('is unchanged for a request about a page', async () => {
    const { layer } = await firstTurnOf('What is the heading of the page?', true);
    expect(layer.calls.map(c => c.tool)).toContain('snapshot');
  });
});

describe('the search sentence for an app request', () => {
  it('keeps the app and the task and drops the instructions about the browser', () => {
    expect(appSearchQuery('Use my connected Google Sheets app, not the browser. Find the spreadsheet named "Xroga Test" and tell me whether it exists.'))
      .toBe('Google Sheets app. Find the spreadsheet named "Xroga Test" and tell me whether it exists.');
    expect(appSearchQuery('Add a row to my Google Sheet with the total, without using the browser')).toBe('Add a row to my Google Sheet with the total.');
    expect(appSearchQuery('List my Notion pages via the API')).toBe('List my Notion pages via the API');
  });
  it('is at most 120 characters and never empty', () => {
    expect(appSearchQuery('Find the spreadsheet in my Google Sheets '.repeat(20)).length).toBeLessThanOrEqual(120);
    expect(appSearchQuery('  Use  ')).toBe('Use');
  });
});

describe('the first turn of a research request', () => {
  const request = 'Compare the top 3 laptop reviews for 2026. Open three review sites at the same time and tell me which laptop each one recommends.';
  function webLayer() {
    let next = 10;
    const open = new Map<number, string>();
    const results = ['[PCMag](https://www.pcmag.com/a)', '[Wired](https://www.wired.com/b)', '[CNET](https://www.cnet.com/c)'].join('\n');
    return new FakeLayer({
      tabs: args => {
        if (args.action !== 'open') return ok('ok');
        const tabId = next++; open.set(tabId, String(args.url));
        return ok('opened', { data: { opened: tabId } as never });
      },
      read: args => { const u = open.get(Number(args.tabId))!; return ok(u.includes('google.com/search') ? results : 'Review text of ' + u); },
    });
  }

  it('reads the search and its top pages before the model is called, and reads no page outline', async () => {
    const layer = webLayer();
    const { notes } = await firstTurnOf(request, false, true, layer);
    expect(notes).toContain(RESEARCH_FIRST_NOTE);
    expect(notes).toContain('Review text of https://www.pcmag.com/a');
    expect(notes).toContain('Review text of https://www.cnet.com/c');
    expect(layer.calls.map(c => c.tool)).not.toContain('snapshot');
    expect(layer.calls.filter(c => c.tool === 'tabs' && c.args.action === 'open')).toHaveLength(4);
  });

  it('is unchanged without the delegate tool, and for a request about a page', async () => {
    expect((await firstTurnOf(request, false, false)).layer.calls.map(c => c.tool)).toContain('snapshot');
    expect((await firstTurnOf('What is the heading of the page?', false, true)).layer.calls.map(c => c.tool)).toContain('snapshot');
  });
});
