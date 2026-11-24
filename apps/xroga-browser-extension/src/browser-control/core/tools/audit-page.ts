// `audit_page`: the page's on-page SEO, accessibility basics and loading numbers in one read of the open tab (no network, no extra tab):
// title, description, canonical, headings, images without alt, links, structured data, social tags, unlabelled fields, and timing (TTFB, FCP, LCP, CLS, size).
// The report states what is wrong in plain lines, worst first, so an audit of many sites is one call per page followed by data_ops, not a page of raw HTML.
import type { PageAudit } from '../../probe/source';
import type { AuditPageArgs } from '../../protocol/schemas';
import type { ToolContext, ToolOutcome } from '../controller';
import { closeTab, openTab, withPageState } from './navigate';

export interface AuditIssue {
  level: 'problem' | 'warning';
  text: string;
}

/** Findings from the measurements, worst first. Thresholds are the public Core Web Vitals and common title/description length guidance. */
export function auditIssues(a: PageAudit): AuditIssue[] {
  const out: AuditIssue[] = [];
  const p = (text: string) => out.push({ level: 'problem', text });
  const w = (text: string) => out.push({ level: 'warning', text });
  if (!a.title) p('No <title>.');
  else if (a.title.length > 65) w(`Title is ${a.title.length} characters; search results cut it near 60.`);
  else if (a.title.length < 15) w(`Title is only ${a.title.length} characters.`);
  if (!a.description) p('No meta description.');
  else if (a.description.length > 165) w(`Meta description is ${a.description.length} characters; search results cut it near 155.`);
  else if (a.description.length < 50) w(`Meta description is only ${a.description.length} characters.`);
  if (a.h1.length === 0) p('No <h1>.');
  else if (a.h1.length > 1) w(`${a.h1.length} <h1> headings; one is the usual rule.`);
  if (!a.canonical) w('No canonical link.');
  if (a.robots && /noindex/i.test(a.robots)) p(`robots meta says "${a.robots}": the page asks not to be indexed.`);
  if (!a.lang) w('<html> has no lang attribute.');
  if (!a.viewport) p('No viewport meta: the page is not set up for phones.');
  if (!a.https) p('Not served over https.');
  if (a.mixedContent) p(`${a.mixedContent} resources load over http on an https page.`);
  if (a.images.noAlt) p(`${a.images.noAlt} of ${a.images.total} images have no alt attribute.`);
  if (a.links.noText) w(`${a.links.noText} links have no text or label.`);
  if (a.forms.unlabelled) p(`${a.forms.unlabelled} form fields have no label.`);
  if (a.buttonsNoName) p(`${a.buttonsNoName} buttons have no accessible name.`);
  if (a.words < 200) w(`Only ${a.words} words of text.`);
  if (!a.social.ogTitle || !a.social.ogImage) w('Open Graph title or image missing: shared links look bare.');
  if (!a.structuredData.length) w('No structured data (JSON-LD).');
  const { lcpMs, cls, ttfbMs, transferKb, domNodes } = a.perf;
  if (lcpMs !== undefined && lcpMs > 2500) (lcpMs > 4000 ? p : w)(`Largest contentful paint ${lcpMs} ms (good is 2500 or less).`);
  if (cls !== undefined && cls > 0.1) (cls > 0.25 ? p : w)(`Layout shift ${cls} (good is 0.1 or less).`);
  if (ttfbMs !== undefined && ttfbMs > 800) w(`Server answered after ${ttfbMs} ms.`);
  if (transferKb !== undefined && transferKb > 3000) w(`${transferKb} KB transferred.`);
  if (domNodes > 1500) w(`${domNodes} elements in the page.`);
  return out.sort((x, y) => (x.level === y.level ? 0 : x.level === 'problem' ? -1 : 1));
}

export function describeAudit(a: PageAudit): string[] {
  const issues = auditIssues(a);
  const perf = a.perf;
  const t = (n: number | undefined, unit = ' ms') => (n === undefined ? 'n/a' : `${n}${unit}`);
  return [
    `audit_page · ${a.url} · ${issues.filter(i => i.level === 'problem').length} problems, ${issues.filter(i => i.level === 'warning').length} warnings`,
    `title (${a.title.length}): ${JSON.stringify(a.title)}`,
    `description (${a.description?.length ?? 0}): ${a.description ? JSON.stringify(a.description) : 'none'}`,
    `h1: ${a.h1.length ? a.h1.map(h => JSON.stringify(h)).join(', ') : 'none'} · h2 ${a.headings.h2} · h3 ${a.headings.h3} · ${a.words} words · lang ${a.lang ?? 'none'} · canonical ${a.canonical ?? 'none'}`,
    `images ${a.images.total} (${a.images.noAlt} without alt, ${a.images.lazy} lazy) · links ${a.links.internal} internal, ${a.links.external} external, ${a.links.nofollow} nofollow · forms ${a.forms.total}`,
    `structured data: ${a.structuredData.length ? a.structuredData.join(', ') : 'none'} · og ${a.social.ogTitle && a.social.ogImage ? 'complete' : 'incomplete'} · twitter card ${a.social.twitterCard ? 'yes' : 'no'} · hreflang ${a.hreflang}`,
    `contact on the page: emails ${a.contacts?.emails.length ? a.contacts.emails.join(', ') : 'none'} · phones ${a.contacts?.phones.length ? a.contacts.phones.join(', ') : 'none'}`,
    `speed: TTFB ${t(perf.ttfbMs)} · FCP ${t(perf.fcpMs)} · LCP ${t(perf.lcpMs)} · CLS ${perf.cls ?? 'n/a'} · load ${t(perf.loadMs)} · ${t(perf.transferKb, ' KB')} in ${perf.requests ?? '?'} requests · ${perf.domNodes} elements`,
    ...(issues.length ? ['Findings, worst first:', ...issues.map(i => `- ${i.level === 'problem' ? 'PROBLEM' : 'warning'}: ${i.text}`)] : ['No findings.']),
  ];
}

export async function auditPage(ctx: ToolContext, args: AuditPageArgs): Promise<ToolOutcome> {
  if (args.url) {
    // Another address: a background tab is opened (the navigation policy applies as for any tab), audited and closed; the session's own tab is never left.
    const previous = ctx.session.activeTabId;
    const opened = await openTab(ctx, { action: 'open', url: args.url });
    const tabId = opened.data!.opened;
    try {
      const child: ToolContext = { ...ctx, tabId, tab: () => ctx.controller.tabState(tabId), attach: () => ctx.controller.attach(tabId) };
      const attachment = await child.attach();
      const frame = (await attachment.topology.frames())[0];
      // Give a script-built page a moment to finish drawing before it is measured.
      await new Promise(resolve => setTimeout(resolve, 600));
      const audit = await child.tab().probe!.callGlobal<PageAudit>(frame, 'auditPage');
      return { data: { audit, issues: auditIssues(audit) }, lines: describeAudit(audit) };
    } finally {
      await closeTab(ctx, { action: 'close', tabId }).catch(() => undefined);
      if (previous !== null && previous !== undefined && ctx.session.hasTab(previous)) ctx.session.setActive(previous);
    }
  }
  const attachment = await ctx.attach();
  const tab = ctx.tab();
  const frame = (await attachment.topology.frames())[0];
  const audit = await tab.probe!.callGlobal<PageAudit>(frame, 'auditPage');
  return withPageState(ctx, 'none', { data: { audit, issues: auditIssues(audit) }, lines: describeAudit(audit) });
}
