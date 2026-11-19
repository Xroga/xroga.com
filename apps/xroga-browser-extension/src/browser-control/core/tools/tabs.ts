// The `tabs` tool: the session's tabs. `open` and `close` are in navigate.ts, with the navigation policy.
import { LayerError } from '../../protocol/errors';
import type { TabsArgs } from '../../protocol/schemas';
import type { TabInfo, TabsData } from '../../protocol/results';
import type { ToolContext, ToolOutcome } from '../controller';
import { closeTab, openTab } from './navigate';
import { quote } from '../text';

export async function sessionTabs(ctx: ToolContext): Promise<TabsData> {
  const tabs: TabInfo[] = [];
  for (const tabId of ctx.session.tabIds()) {
    const tab = await ctx.controller.host.tabs.get(tabId);
    if (!tab) {
      ctx.session.forgetTab(tabId);
      continue;
    }
    tabs.push({ tabId, url: tab.url, title: tab.title, active: tabId === ctx.session.activeTabId });
  }
  return { tabs, activeTabId: ctx.session.activeTabId };
}

/** One line per tab, the tool's own, with the page's title and address quoted. */
function render(data: TabsData): string[] {
  return data.tabs.map(
    t => `${t.active ? '*' : ' '} tab ${t.tabId} · ${quote(t.title || '(untitled)')} · ${quote(t.url)}`,
  );
}

export async function tabs(ctx: ToolContext, args: TabsArgs): Promise<ToolOutcome<TabsData>> {
  switch (args.action) {
    case 'list':
      break;
    case 'select': {
      if (args.tabId === undefined) throw new LayerError('INVALID_ARGUMENT', 'tabs select needs tabId');
      ctx.session.setActive(args.tabId);
      // The session's current tab changes; whether it also becomes the visible tab is the host's decision, and the
      // window is never focused.
      if (await ctx.session.shouldReveal(args.tabId)) await ctx.controller.host.tabs.activate(args.tabId);
      break;
    }
    case 'adopt': {
      // Uses a tab the user already has open, when the user named it. Only tabs of the session's window whose title or address
      // contains the text are considered, and only those are ever named in a reply: other tabs of the user stay unseen.
      const needle = (args.url ?? '').trim().toLowerCase();
      if (needle.length < 3) throw new LayerError('INVALID_ARGUMENT', 'tabs adopt needs url: part of the title or address of the tab the user named');
      const home = ctx.session.activeTabId === null ? null : await ctx.controller.host.tabs.get(ctx.session.activeTabId);
      const open = (await ctx.controller.host.tabs.list()).filter(
        t => (!home || t.windowId === home.windowId) && /^https?:/i.test(t.url) && (t.title.toLowerCase().includes(needle) || t.url.toLowerCase().includes(needle)),
      );
      const inSession = open.filter(t => ctx.session.hasTab(t.tabId));
      const fresh = open.filter(t => !ctx.session.hasTab(t.tabId));
      if (fresh.length === 0) {
        if (inSession.length === 1) {
          ctx.session.setActive(inSession[0].tabId);
          await ctx.controller.host.tabs.activate(inSession[0].tabId); // a tab the user named must be visible: Chrome cannot capture a hidden tab
          break;
        }
        throw new LayerError('NO_MATCH', `No tab of this window has ${quote(args.url ?? '', 40)} in its title or address. Open it with tabs open or navigate.`);
      }
      if (fresh.length > 1) {
        throw new LayerError('AMBIGUOUS_TARGET', `${fresh.length} open tabs match ${quote(args.url ?? '', 40)}: ${fresh.slice(0, 5).map(t => `tab ${t.tabId} ${quote(t.title || '(untitled)', 50)}`).join('; ')}. Repeat with a more specific match.`);
      }
      ctx.session.shareTab(fresh[0].tabId, 'shared');
      await ctx.controller.host.tabs.activate(fresh[0].tabId); // a tab the user named must be visible: Chrome cannot capture a hidden tab
      break;
    }
    case 'open':
      return openTab(ctx, args);
    case 'close':
      return closeTab(ctx, args);
  }
  const data = await sessionTabs(ctx);
  return { data, lines: [`tabs · ${data.tabs.length} in session`, ...render(data)] };
}
