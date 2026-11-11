// Sub-agent readers on real tabs: several pages read at once, each in its own tab that is closed afterwards, with the
// session left on the tab it was on. No model is called; the explorers' loop is tested against the fake layer.
import { layerPort } from '../../extension/agent-session';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { parseJobs, runSubagents } from '../../agent/subagents';
import { defineScenario, outcome } from './registry';

defineScenario({
  id: 'S1-readers-in-parallel',
  set: 'C',
  title: 'delegate three readers at once: two fixture pages and one address the policy refuses',
  covers: 'readers open background tabs, read them together, close them, keep the main tab, and report a refusal without failing the rest',
  async run(ctx) {
    const main = await ctx.open(`${FIXTURE_ORIGIN}/index.html`);
    const before = await ctx.call('tabs', { action: 'list' });
    const countBefore = (before.data as { tabs: unknown[] }).tabs.length;
    const { jobs } = parseJobs({
      jobs: [
        { kind: 'reader', url: `${FIXTURE_ORIGIN}/c-text.html` },
        { kind: 'reader', url: `${FIXTURE_ORIGIN}/c-states.html` },
        { kind: 'reader', url: 'http://127.0.0.1:1/blocked' },
      ],
    });
    const started = performance.now();
    const r = await runSubagents(
      { layer: layerPort(ctx.session), model: undefined as never, signal: new AbortController().signal },
      jobs,
    );
    const ms = Math.round(performance.now() - started);
    const after = await ctx.call('tabs', { action: 'list' });
    const t = after.data as { tabs: Array<{ tabId: number }>; activeTabId: number };
    const readTwo = r.text.includes('Text and form controls') && /Helper 2 · reader/.test(r.text);
    const refusedOrFailed = /Helper 3 · reader[\s\S]*(could not|stopped)/.test(r.text);
    return outcome(
      'two pages read, the third reported as failed, helper tabs closed, the main tab still the session’s tab',
      `${ms} ms; read ${readTwo}; third reported ${refusedOrFailed}; tabs ${countBefore} -> ${t.tabs.length}; active ${t.activeTabId} (main ${main})`,
      readTwo && refusedOrFailed && t.tabs.length === countBefore && t.activeTabId === main,
      { text: r.text.slice(0, 600) },
    );
  },
});
