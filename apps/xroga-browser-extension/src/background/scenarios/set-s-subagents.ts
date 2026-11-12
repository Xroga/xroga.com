// Page readers on real tabs (the `delegate` tool): several pages read at once, each in its own tab that is closed afterwards,
// with the session left on the tab it was on; and a results page whose top links, one per site, are read in the same call.
// No model is called by either.
import { layerPort } from '../../extension/agent-session';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { parseJobs, runSubagents } from '../../agent/subagents';
import { defineScenario, outcome } from './registry';
import type { ScenarioContext } from './registry';

async function tabsOf(ctx: ScenarioContext) {
  const r = await ctx.call('tabs', { action: 'list' });
  return r.data as { tabs: Array<{ tabId: number }>; activeTabId: number };
}

defineScenario({
  id: 'S1-readers-in-parallel',
  set: 'C',
  title: 'delegate three reads at once: two fixture pages and one address the policy refuses',
  covers: 'pages are read together in background tabs, tabs are closed, the main tab stays, and a refusal is reported without failing the rest',
  async run(ctx) {
    const main = await ctx.open(`${FIXTURE_ORIGIN}/index.html`);
    const before = await tabsOf(ctx);
    const { jobs } = parseJobs({
      jobs: [
        { url: `${FIXTURE_ORIGIN}/c-text.html` },
        { url: `${FIXTURE_ORIGIN}/c-states.html` },
        { url: 'http://127.0.0.1:1/blocked' },
      ],
    });
    const started = performance.now();
    const r = await runSubagents({ layer: layerPort(ctx.session), signal: new AbortController().signal }, jobs);
    const ms = Math.round(performance.now() - started);
    const after = await tabsOf(ctx);
    const readTwo = r.text.includes('Text and form controls') && /Page 2 ·/.test(r.text);
    const failed = /Page 3 ·[\s\S]*(could not|stopped)/.test(r.text);
    return outcome(
      'two pages read, the third reported as failed, helper tabs closed, the main tab still the session’s tab',
      `${ms} ms; read ${readTwo}; third reported ${failed}; tabs ${before.tabs.length} -> ${after.tabs.length}; active ${after.activeTabId} (main ${main})`,
      readTwo && failed && after.tabs.length === before.tabs.length && after.activeTabId === main,
      { text: r.text.slice(0, 600) },
    );
  },
});

defineScenario({
  id: 'S2-follow-results',
  set: 'C',
  title: 'delegate a results page with follow: its links, one per site, are read in the same call',
  covers: 'result links are taken from the page, one page per site, read in parallel, and every helper tab is closed',
  async run(ctx) {
    const main = await ctx.open(`${FIXTURE_ORIGIN}/index.html`);
    const before = await tabsOf(ctx);
    const { jobs } = parseJobs({ jobs: [{ url: `${FIXTURE_ORIGIN}/s-results.html`, follow: 3 }] });
    const started = performance.now();
    const r = await runSubagents({ layer: layerPort(ctx.session), signal: new AbortController().signal }, jobs);
    const ms = Math.round(performance.now() - started);
    const after = await tabsOf(ctx);
    const pages = [...r.text.matchAll(/^## Page \d+ · (.*)$/gm)].map(m => m[1]);
    const firstRead = r.text.includes('Text and form controls');
    // Three links, two sites: the third shares the first one's site and is left out.
    const twoSites = pages.length === 2 && !pages.some(p => p.includes('c-login'));
    return outcome(
      'the first link of each site read in parallel (two pages), none of the same site twice, every helper tab closed',
      `${ms} ms; headings ${JSON.stringify(pages)}; first read ${firstRead}; tabs ${before.tabs.length} -> ${after.tabs.length}; active ${after.activeTabId} (main ${main})`,
      twoSites && firstRead && after.tabs.length === before.tabs.length && after.activeTabId === main,
      { text: r.text.slice(0, 800) },
    );
  },
});
