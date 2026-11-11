import { describe, expect, it } from 'vitest';
import { addressOf, parseJobs, resultLinks, runSubagents, MAX_JOBS, DELEGATE_TOOL } from '../subagents';
import { kindOf } from '../tools';
import { isResearchRequest, researchPlan } from '../routing';
import { FakeLayer, ok } from '../testing/fake-layer';

/** A layer whose pages are known by address, with tabs opened and closed like the real one. */
function layerWithPages(pages: Record<string, string>, failing: string[] = []) {
  let nextTab = 10;
  const open = new Map<number, string>();
  const layer = new FakeLayer({
    tabs: args => {
      if (args.action === 'open') {
        const url = String(args.url);
        if (failing.some(f => url.includes(f))) return { ok: false, text: 'error URL_NOT_ALLOWED blocked' };
        const tabId = nextTab++;
        open.set(tabId, url);
        return ok(`tabs open · tab ${tabId}`, { data: { tabs: [], activeTabId: tabId, opened: tabId } as never });
      }
      return ok('tabs · ok');
    },
    read: args => {
      const url = open.get(Number(args.tabId))!;
      return ok(`<<<page-content 000000000000 site=x>>>\n${pages[url] ?? `Text of ${url}`}\n<<<end-page-content 000000000000>>>`);
    },
  });
  return { layer, open };
}

const signal = () => new AbortController().signal;

describe('delegate: the jobs', () => {
  it('accepts urls and searches, and says what is wrong with the rest', () => {
    const { jobs, problems } = parseJobs({ jobs: [
      { url: 'https://a.example/x' },
      { query: 'best laptops 2026', follow: 5 },
      { query: 'x', follow: 99 },
      { url: 'javascript:alert(1)' },
      {},
    ] });
    expect(jobs).toEqual([{ url: 'https://a.example/x' }, { query: 'best laptops 2026', follow: 5 }, { query: 'x', follow: 10 }]);
    expect(problems).toHaveLength(2);
  });
  it('runs at most ten, never none', () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ url: `https://s${i}.example` }));
    expect(parseJobs({ jobs: many }).jobs).toHaveLength(MAX_JOBS);
    expect(parseJobs({}).jobs).toEqual([]);
  });
  it('opens a search for a query and is a read for the execution policy', () => {
    expect(addressOf({ query: 'a b&c' })).toBe('https://www.google.com/search?q=a%20b%26c');
    expect(kindOf('delegate', {})).toBe('read');
    expect(DELEGATE_TOOL.parameters).toMatchObject({ required: ['jobs'] });
  });
});

describe('the links of a search page', () => {
  const page = [
    '[Skip to main content](https://www.google.com/#main)',
    '[Best Laptops of 2026](https://www.pcmag.com/picks/best-laptops)',
    '[PCMag again](https://www.pcmag.com/reviews/other)',
    '[Wired review](https://www.wired.com/gallery/best-laptops/)',
    '[Redirect](https://www.google.com/url?q=https://www.cnet.com/tech/best-laptop/&sa=U)',
    '[Video](https://www.youtube.com/watch?v=1)',
    '[Maps](https://maps.google.com/x)',
    '[Tom’s Hardware](https://www.tomshardware.com/laptops/best-laptops)',
  ].join('\n');
  it('takes one per site in order, unwraps redirects and leaves the engine, video and social out', () => {
    expect(resultLinks(page, 3).map(l => l.url)).toEqual([
      'https://www.pcmag.com/picks/best-laptops',
      'https://www.wired.com/gallery/best-laptops/',
      'https://www.cnet.com/tech/best-laptop/',
    ]);
    expect(resultLinks(page, 10)).toHaveLength(4);
    expect(resultLinks('no links here', 3)).toEqual([]);
  });
});

describe('delegate: reading', () => {
  it('reads several pages together, each in its own tab that is closed afterwards, with no model call', async () => {
    const { layer } = layerWithPages({});
    const { jobs } = parseJobs({ jobs: [{ url: 'https://a.example' }, { url: 'https://b.example' }, { url: 'https://c.example' }] });
    const r = await runSubagents({ layer, signal: signal() }, jobs);
    expect(r.isError).toBe(false);
    for (const u of ['a', 'b', 'c']) expect(r.text).toContain(`Text of https://${u}.example`);
    expect(r.text).toContain('Answer from them');
    const closed = layer.calls.filter(c => c.tool === 'tabs' && c.args.action === 'close').map(c => c.args.tabId).sort();
    expect(closed).toEqual([10, 11, 12]);
  });

  it('with follow, reads the search page and then its top result pages in the same call', async () => {
    const results = '[PCMag](https://www.pcmag.com/a)\n[Wired](https://www.wired.com/b)\n[CNET](https://www.cnet.com/c)\n[Verge](https://www.theverge.com/d)';
    const { layer } = layerWithPages({ 'https://www.google.com/search?q=best%20laptops': results });
    const r = await runSubagents({ layer, signal: signal() }, [{ query: 'best laptops', follow: 3 }]);
    expect(r.text).toContain('Text of https://www.pcmag.com/a');
    expect(r.text).toContain('Text of https://www.wired.com/b');
    expect(r.text).toContain('Text of https://www.cnet.com/c');
    expect(r.text).not.toContain('theverge');
    expect(layer.calls.filter(c => c.tool === 'tabs' && c.args.action === 'open')).toHaveLength(4);
    expect(layer.calls.filter(c => c.tool === 'tabs' && c.args.action === 'close')).toHaveLength(4);
  });

  it('with follow but no result links (a blocked search page), returns the search page for the agent to decide', async () => {
    const { layer } = layerWithPages({ 'https://www.google.com/search?q=x': 'Our systems have detected unusual traffic' });
    const r = await runSubagents({ layer, signal: signal() }, [{ query: 'x', follow: 3 }]);
    expect(r.text).toContain('no result links could be taken');
    expect(r.text).toContain('unusual traffic');
  });

  it('reports a page that cannot be opened and still returns the others', async () => {
    const { layer } = layerWithPages({}, ['blocked']);
    const r = await runSubagents({ layer, signal: signal() }, [{ url: 'https://blocked.example' }, { url: 'https://fine.example' }]);
    expect(r.text).toContain('could not open the page');
    expect(r.text).toContain('Text of https://fine.example');
  });

  it('puts the main agent back on its own tab if opening pages moved the session', async () => {
    const { layer } = layerWithPages({});
    let listed = 0;
    layer.tabs = async () => (listed++ === 0
      ? { tabs: [{ tabId: 1, url: 'https://main.example', title: 'm', active: true }], activeTabId: 1 }
      : { tabs: [{ tabId: 1, url: 'https://main.example', title: 'm', active: false }], activeTabId: 12 });
    await runSubagents({ layer, signal: signal() }, [{ url: 'https://a.example' }]);
    expect(layer.calls.some(c => c.tool === 'tabs' && c.args.action === 'select' && c.args.tabId === 1)).toBe(true);
  });
});

describe('a research request', () => {
  it.each([
    'Compare the top 3 laptop reviews for 2026. Open three review sites at the same time and tell me which laptop each one recommends, with the links.',
    'Research the best CRM tools for small agencies and summarize',
    'Open 10 different sites about solar panels and tell me the first headline of each',
    'What is the latest news about the EU AI Act?',
  ])('starts with the web read first: %s', request => expect(isResearchRequest(request)).toBe(true));

  it.each([
    'Open https://example.com and tell me the heading',
    'Click the Pay button on this page',
    'Summarize this page',
    'Use my connected Google Sheets app, not the browser. Find the sheet',
    'Buy the best laptop under 1000 dollars',
    'Log in to my bank and check the balance',
  ])('does not: %s', request => expect(isResearchRequest(request)).toBe(false));

  it('makes a search sentence and a page count from the words', () => {
    expect(researchPlan('Compare the top 3 laptop reviews for 2026. Open three review sites at the same time and tell me which laptop each one recommends, with the links.'))
      .toEqual({ query: 'the top 3 laptop reviews for 2026', follow: 3 });
    expect(researchPlan('Open 10 different sites about solar panels and tell me the first headline of each').follow).toBe(10);
    expect(researchPlan('Research the best CRM tools for small agencies').follow).toBe(4);
    expect(researchPlan('Research the best CRM tools for small agencies').query).toBe('the best CRM tools for small agencies');
  });
});
