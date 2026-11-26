// webmcp on a real site that offers agent tools: the Panoptik demo studio registers its tools through the WebMCP API when the page loads. The tab is shared with the agent
// first (that installs the hook), the page is loaded again so the hook sees the registrations, then the tools are listed and a read-only one is called.
import { describeCallResult, describeListing } from '../../agent/webmcp';
import { callPageTool, listPageTools, reloadTab } from '../../extension/webmcp';
import { sleep } from '../checks/helpers';
import { defineScenario, outcome } from './registry';

const SITE = 'https://panoptik-studio.vercel.app/editor';

defineScenario({
  id: 'S5-webmcp',
  set: 'C',
  title: 'tools a real site offers an agent are listed and one is called',
  covers: 'webmcp: the hook supplies navigator.modelContext (and the older document and window names) so a page registers its tools; list shows them with arguments; call runs a read-only one',
  async run(ctx) {
    const tabId = await ctx.open(SITE);
    await ctx.call('read', { tabId }); // sharing the tab with the agent puts the hook in
    await reloadTab(tabId);
    await sleep(2500);
    const listing = await listPageTools(tabId);
    const text = describeListing(listing);
    const readOnly = listing.tools.find(t => t.readOnly);
    const called = readOnly ? await callPageTool(tabId, readOnly.name, {}) : undefined;
    const shown = called && called.ok ? describeCallResult(called.value, 400) : called ? `failed: ${called.error}` : 'no read-only tool';
    return outcome(
      'the page registers tools through WebMCP, they are listed with arguments, and a read-only one answers',
      JSON.stringify({ hooked: listing.hooked, native: listing.native, seen: listing.seen, count: listing.tools.length, names: listing.tools.map(t => t.name).slice(0, 40), readOnlyCalled: readOnly?.name, answer: shown.slice(0, 400), listing: text.slice(0, 900) }),
      listing.hooked && listing.tools.length >= 3 && !!called && called.ok,
    );
  },
});
