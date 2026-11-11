import { describe, expect, it } from 'vitest';
import { ScriptedModel, resolveProfile } from '@src/llm';
import { addressOf, parseJobs, runSubagents, MAX_JOBS, DELEGATE_TOOL } from '../subagents';
import { kindOf } from '../tools';
import { FakeLayer, ok } from '../testing/fake-layer';

function layerWithPages() {
  let nextTab = 10;
  const pages = new Map<number, string>();
  return new FakeLayer({
    tabs: args => {
      if (args.action === 'open') {
        const tabId = nextTab++;
        pages.set(tabId, String(args.url));
        return ok(`tabs open · tab ${tabId}`, { data: { tabs: [], activeTabId: tabId, opened: tabId } as never });
      }
      return ok('tabs · ok');
    },
    read: args => ok(`Text of ${pages.get(Number(args.tabId))}`),
    snapshot: args => ok(`Outline of ${pages.get(Number(args.tabId))}`),
  });
}

const model = (scripted: ScriptedModel) => ({
  ref: { providerId: 'p', model: 'm' }, chat: scripted.chat(), profile: resolveProfile({ kind: 'openai-compatible', modelName: 'm' }), reasoning: 'none' as const,
});

describe('delegate: the jobs', () => {
  it('accepts readers and explorers, and says what is wrong with the rest', () => {
    const { jobs, problems } = parseJobs({ jobs: [
      { kind: 'reader', url: 'https://a.example/x' },
      { kind: 'reader', query: 'best laptops 2026' },
      { kind: 'explorer', url: 'https://b.example', goal: 'find the price' },
      { kind: 'explorer', url: 'https://b.example' },
      { kind: 'reader', url: 'javascript:alert(1)' },
      { kind: 'writer', url: 'https://c.example' },
      { kind: 'reader' },
    ] });
    expect(jobs.map(j => j.kind)).toEqual(['reader', 'reader', 'explorer']);
    expect(problems).toHaveLength(4);
    expect(problems.join(' ')).toContain('needs a goal');
    expect(problems.join(' ')).toContain('http');
  });
  it('runs at most six, never none', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ kind: 'reader', url: `https://s${i}.example` }));
    const { jobs, problems } = parseJobs({ jobs: many });
    expect(jobs).toHaveLength(MAX_JOBS);
    expect(problems.join(' ')).toContain('first 6');
    expect(parseJobs({}).jobs).toEqual([]);
    expect(parseJobs({ jobs: [] }).problems).toHaveLength(1);
  });
  it('opens a search for a query and is a read for the execution policy', () => {
    expect(addressOf({ kind: 'reader', query: 'a b&c' })).toBe('https://www.google.com/search?q=a%20b%26c');
    expect(kindOf('delegate', {})).toBe('read');
    expect(DELEGATE_TOOL.parameters).toMatchObject({ required: ['jobs'] });
  });
});

describe('delegate: readers', () => {
  it('read several pages together, each in its own tab that is closed afterwards, with no model call', async () => {
    const layer = layerWithPages();
    const scripted = new ScriptedModel([]);
    const { jobs } = parseJobs({ jobs: [{ kind: 'reader', url: 'https://a.example' }, { kind: 'reader', url: 'https://b.example' }, { kind: 'reader', query: 'x' }] });
    const r = await runSubagents({ layer, model: model(scripted), signal: new AbortController().signal }, jobs);
    expect(r.isError).toBe(false);
    expect(r.text).toContain('Text of https://a.example');
    expect(r.text).toContain('Text of https://b.example');
    expect(r.text).toContain('Text of https://www.google.com/search?q=x');
    expect(scripted.calls).toHaveLength(0);
    const opened = layer.calls.filter(c => c.tool === 'tabs' && c.args.action === 'open');
    const closed = layer.calls.filter(c => c.tool === 'tabs' && c.args.action === 'close').map(c => c.args.tabId).sort();
    expect(opened).toHaveLength(3);
    expect(closed).toEqual([10, 11, 12]);
    // The page text is wrapped as untrusted content.
    expect(r.text).toContain('<<<page-content');
  });

  it('reports a page that cannot be opened and still returns the others', async () => {
    const layer = new FakeLayer({
      tabs: args => (args.action === 'open'
        ? (String(args.url).includes('blocked') ? { ok: false, text: 'error URL_NOT_ALLOWED blocked' } : ok('opened', { data: { opened: 7 } as never }))
        : ok('ok')),
      read: () => ok('hello'),
    });
    const { jobs } = parseJobs({ jobs: [{ kind: 'reader', url: 'https://blocked.example' }, { kind: 'reader', url: 'https://fine.example' }] });
    const r = await runSubagents({ layer, model: model(new ScriptedModel([])), signal: new AbortController().signal }, jobs);
    expect(r.text).toContain('could not open the page');
    expect(r.text).toContain('hello');
  });

  it('puts the main agent back on its own tab if opening helpers moved the session', async () => {
    const layer = layerWithPages();
    let listed = 0;
    layer.tabs = async () => (listed++ === 0
      ? { tabs: [{ tabId: 1, url: 'https://main.example', title: 'm', active: true }], activeTabId: 1 }
      : { tabs: [{ tabId: 1, url: 'https://main.example', title: 'm', active: false }], activeTabId: 12 });
    const { jobs } = parseJobs({ jobs: [{ kind: 'reader', url: 'https://a.example' }] });
    await runSubagents({ layer, model: model(new ScriptedModel([])), signal: new AbortController().signal }, jobs);
    expect(layer.calls.some(c => c.tool === 'tabs' && c.args.action === 'select' && c.args.tabId === 1)).toBe(true);
  });
});

describe('delegate: explorers', () => {
  it('look on their own tab, only with read-only tools, and report', async () => {
    const layer = layerWithPages();
    const scripted = new ScriptedModel([
      { toolCalls: [{ name: 'snapshot', input: {}, id: 's1' }] },
      { toolCalls: [{ name: 'click', input: { target: { ref: 'e1' } }, id: 'c1' }] },
      { toolCalls: [{ name: 'report', input: { findings: 'The price is 10 euro at https://b.example/p' }, id: 'r1' }] },
    ]);
    const { jobs } = parseJobs({ jobs: [{ kind: 'explorer', url: 'https://b.example', goal: 'find the price' }] });
    const r = await runSubagents({ layer, model: model(scripted), signal: new AbortController().signal }, jobs);
    expect(r.text).toContain('The price is 10 euro');
    expect(scripted.calls[0].tools.map(t => t.name).sort()).toEqual(['find', 'navigate', 'read', 'report', 'snapshot', 'wait']);
    const snap = layer.calls.find(c => c.tool === 'snapshot')!;
    expect(snap.args.tabId).toBe(10);
    // A tool outside the list never reaches the layer.
    expect(layer.calls.some(c => c.tool === 'click')).toBe(false);
    expect(layer.calls.some(c => c.tool === 'tabs' && c.args.action === 'close' && c.args.tabId === 10)).toBe(true);
  });

  it('stop after six turns with what they last said', async () => {
    const layer = layerWithPages();
    const scripted = new ScriptedModel(() => ({ text: 'still looking', toolCalls: [{ name: 'snapshot', input: {}, id: Math.random().toString(36) }] }));
    const { jobs } = parseJobs({ jobs: [{ kind: 'explorer', url: 'https://b.example', goal: 'g' }] });
    const r = await runSubagents({ layer, model: model(scripted), signal: new AbortController().signal }, jobs);
    expect(scripted.calls).toHaveLength(6);
    expect(r.text).toContain('still looking');
  });

  it('a mixed batch runs readers and explorers together', async () => {
    const layer = layerWithPages();
    const scripted = new ScriptedModel([{ toolCalls: [{ name: 'report', input: { findings: 'found it' }, id: 'r' }] }]);
    const { jobs } = parseJobs({ jobs: [{ kind: 'reader', url: 'https://a.example' }, { kind: 'explorer', url: 'https://b.example', goal: 'g' }] });
    const r = await runSubagents({ layer, model: model(scripted), signal: new AbortController().signal }, jobs);
    expect(r.text).toContain('Helper 1 · reader');
    expect(r.text).toContain('Helper 2 · explorer');
    expect(r.text).toContain('found it');
  });
});
