// A curated, on-demand catalog of professional-workflow skills, stored in the portable Agent Skills SKILL.md format and validated by parseSkillMd at load.
// Nothing here is loaded into the model prompt by default: the model asks `find_skill` (small cards ranked by the task and the page host) and then
// `read_skill` for the one it needs. A skill gives method, official documentation links and verification rules. It never grants a permission: every
// action still goes through the run's tools, approvals and spending rules. `verified` says how far a skill has been exercised: curated (written from
// official documentation, not yet run), fixture (a Chrome fixture class passes) or live (a real third-party run passed). Nothing is marked live without evidence.
import { parseSkillMd, type SkillMd } from './skill-md';
import { identify, matchSite } from './site-context';

type Verified = 'curated' | 'fixture' | 'live';

const SOURCES: Array<{ md: string; verified: Verified }> = [
  {
    verified: 'curated',
    md: `---
name: google-ads-search-campaigns
description: Plan, review or configure Google Ads Search campaigns from a business objective: keywords, match types, negatives, bidding, conversion tracking and lead quality.
license: Xroga-internal
metadata:
  domain: advertising
  hosts: ads.google.com
  keywords: google ads campaign keywords bidding negative keywords conversion tracking cpa roas leads search ad group
  requires: browser
  risk: spend
  docs: https://support.google.com/google-ads https://developers.google.com/google-ads/api/docs/start https://skillshop.withgoogle.com
---
Start from the objective, not the campaign type: leads, purchases, calls or traffic need different conversion actions and bidding.
- Inspect the real account first (conversion actions and their status, existing campaigns, budgets, search terms) before proposing a change. Quote the numbers you read.
- Search campaigns: one theme per ad group, match types chosen deliberately, a negative keyword list built from the search terms report, responsive search ads written only from facts on the advertiser website.
- Bidding follows data: with no conversion history use a manual or click based strategy with a cap; move to Target CPA or Maximize conversions only when conversions are tracked and volume is enough.
- Lead quality: prefer a primary conversion that reflects a qualified lead (form plus offline or call outcome) over any click.
- Never promise profit. Report measurable objectives and what was actually changed.
Verify: re-open the campaign or ad group after saving and read back budget, bidding strategy, keywords and status.
Approvals: creating or enabling a campaign, changing a budget or bid, or anything that spends money needs the user's explicit approval at that step. Leave new campaigns paused or in draft until approved.`,
  },
  {
    verified: 'curated',
    md: `---
name: meta-ads-campaigns
description: Configure or review Meta (Facebook and Instagram) ads: objective, audience, placements, budget, creative and conversion events, with approvals before spend.
license: Xroga-internal
metadata:
  domain: advertising
  hosts: business.facebook.com adsmanager.facebook.com facebook.com
  keywords: meta ads facebook instagram campaign objective audience placement budget pixel conversion events creative
  requires: browser
  risk: spend
  docs: https://developers.facebook.com/docs/marketing-apis https://www.facebook.com/business/help
---
- Pick the campaign objective from the business goal (leads, sales, traffic, awareness); the objective decides which optimisation event and conversion setup apply.
- Read the existing account state (pixel or dataset, conversion events and their status, existing audiences) before creating anything.
- Audience: state the targeting you chose and why; use only data the user owns or may use.
- Placements: leave automatic placements unless the user or data says otherwise.
- Creative: use only assets and claims the user supplied or the advertiser site shows.
Verify: after saving, re-open the ad set and read back objective, budget, schedule, audience summary and status.
Approvals: publishing, a budget or schedule change, and any payment step need explicit approval. Save as draft or paused until then.`,
  },
  {
    verified: 'curated',
    md: `---
name: shopify-store-admin
description: Manage a Shopify store in the admin: products, collections, inventory, discounts, SEO fields and storefront settings, without creating duplicates.
license: Xroga-internal
metadata:
  domain: ecommerce
  hosts: admin.shopify.com myshopify.com
  keywords: shopify store product collection inventory discount seo variant sku order storefront theme
  requires: browser
  risk: write
  docs: https://shopify.dev/docs/api/admin-graphql https://help.shopify.com
---
- Search before you create: look the product, collection or discount up by SKU, handle or code so no duplicate is made.
- Change one record at a time and save once; the admin shows a save bar, so confirm it disappears.
- Products: title, description, media, price, compare-at price, SKU and inventory per location; check variants separately.
- Discounts and any price change affect customers immediately: confirm scope (products, customers, dates) before saving.
- SEO: page title, meta description and URL handle live under the search listing preview of each record.
Verify: re-open the record and read back the fields you set. Do not rely on the success toast alone.
Approvals: publishing to the storefront, deleting, bulk edits, price changes and refunds need explicit approval.`,
  },
  {
    verified: 'curated',
    md: `---
name: crm-records
description: Create or update CRM contacts, companies and deals safely: search first, change once, verify by re-reading, never send messages implicitly.
license: Xroga-internal
metadata:
  domain: crm
  hosts: app.hubspot.com salesforce.com lightning.force.com pipedrive.com zoho.com
  keywords: crm contact company deal lead pipeline hubspot salesforce pipedrive record owner stage
  requires: browser
  risk: write
  docs: https://developers.hubspot.com/docs https://help.salesforce.com
---
- Search by a unique value (email, domain, phone) before creating a record; update the existing one when found.
- Set only the fields the user named. Owner, stage and associations are fields too: read them back.
- After saving, open the record again and compare the saved values with the request. A missing record is "not confirmed", never created a second time.
- Logging a note or task is a write; sending an email, a sequence step or a message is outbound communication and needs the user's approval.`,
  },
  {
    verified: 'curated',
    md: `---
name: spreadsheets-and-documents
description: Edit web spreadsheets and documents (Google Sheets, Docs, Office on the web): cell ranges, formulas, formatting and verified saved content.
license: Xroga-internal
metadata:
  domain: office
  hosts: docs.google.com sheets.google.com office.com sharepoint.com
  keywords: spreadsheet sheet cell range formula document docs word excel table format
  requires: browser connected_app
  risk: write
  docs: https://developers.google.com/sheets/api https://support.google.com/docs
---
- If a connected Google or Microsoft app tool is available, use it for reads and writes of data: it is faster and exact. Use the page only for what the tool cannot do.
- In a sheet, address cells by range (A1 notation) through the name box; paste whole blocks rather than typing cell by cell.
- Formulas: enter with the leading equals sign and read back the displayed value, not only the formula text.
- Verify by reading the range back and comparing with the intended values. Autosave is not proof: check the saved indicator.
- Sharing, permission changes and deleting a sheet or document need approval.`,
  },
  {
    verified: 'curated',
    md: `---
name: web-coding-workflow
description: Work on code in the browser (GitHub, web IDEs): read files, edit, commit on a branch, open a pull request, and verify with the project tests.
license: Xroga-internal
metadata:
  domain: coding
  hosts: github.com gitlab.com codespaces.new stackblitz.com replit.com
  keywords: github repository code commit branch pull request issue editor ide file diff test
  requires: browser backend_worker
  risk: write
  docs: https://docs.github.com
---
- Read before editing: open the file and the surrounding code. Make the smallest change that does the task.
- Work on a branch; never commit to the default branch unless the user said so.
- Verify with the project tests or build output, and quote the result. If tests cannot run in the browser, say so; do not claim a pass.
- A push, merge or pull request comment is an outward action that needs the user's approval: confirm the target repository and branch first.
- Secrets and tokens are never typed into a page or a commit.`,
  },
  {
    verified: 'curated',
    md: `---
name: seo-onpage-audit
description: Audit a page for on-page SEO using visible evidence: title, meta description, headings, canonical, structured data, internal links, indexing signals.
license: Xroga-internal
metadata:
  domain: seo
  hosts: search.google.com
  keywords: seo audit title meta description heading canonical schema structured data indexing robots sitemap links search console
  requires: browser
  risk: read
  docs: https://developers.google.com/search/docs
---
- Read the page head and body text; list the title, meta description, the h1 and heading outline, canonical URL, robots meta and structured data type.
- Check one issue at a time and cite where you saw it. Do not guess rankings or traffic.
- For indexing, use Search Console only if the user has it open or connected; otherwise say what could not be checked.
- Recommendations are written suggestions. Editing a live site is a separate step needing approval.`,
  },
  {
    verified: 'curated',
    md: `---
name: dashboard-data-extraction
description: Read tables, charts and dashboards in business apps and export accurate data: scroll virtualised lists, paginate, read exact values, verify counts.
license: Xroga-internal
metadata:
  domain: data
  hosts: ""
  keywords: dashboard table report export csv data rows pagination virtualized list chart metrics analytics
  requires: browser
  risk: read
  docs: ""
---
- Prefer the app export (CSV, download) over copying cells. If none, read rows with the read tool and paginate until the stated total is reached.
- Virtualised lists only render visible rows: scroll in steps and de-duplicate by a stable key.
- Report exact values and the date range or filters in force. Check the row count against the page total.
- Derived numbers (sums, rates) are computed from the extracted rows and shown with the rows they came from.`,
  },
  {
    verified: 'fixture',
    md: `---
name: painted-editor-scripting
description: Drive canvas-painted editors (vector, design, diagram tools) through their scripting or command console instead of dozens of clicks, then verify the exported artifact.
license: Xroga-internal
metadata:
  domain: graphics
  hosts: tracedraw.github.io
  keywords: canvas vector graphics editor design drawing svg script console macro shapes export artboard
  requires: browser
  risk: write
  docs: ""
---
- Look for a scripting, macro or command console first. One short program replaces many clicks; run_script_console runs the whole sequence (open, focus, replace text, run, read Output, verify, export) and refuses stale Output.
- Read the app scripting documentation once and use its real API names; never invent calls.
- Make ONE new document, run the program once, and check the result on the page, not only the Output line.
- Without a console, use canvas click, drag and key with fractions taken from a screenshot, batching the known steps.
Verify: export the file and check its contents (page size, objects, colours, text), not only that a download happened.
Approvals: saving to a remote account or publishing needs the user's approval; local export does not.`,
  },
  {
    verified: 'fixture',
    md: `---
name: video-timeline-editor
description: Operate a web video or audio timeline editor: import media, split and trim clips, move clips, add captions and audio changes, export, and check the output file.
license: Xroga-internal
metadata:
  domain: video
  hosts: ""
  keywords: video editor timeline clip trim split subtitle caption audio track export render keyframe media
  requires: browser
  risk: write
  docs: ""
---
- Timelines are usually painted: compute positions from times the app shows (clip start, end, ruler scale) and use canvas click, key and drag with viewport fractions.
- Set the playhead by clicking the ruler, then use the app split shortcut; read the clip list or inspector to confirm the new boundaries.
- Do one edit, then confirm it from the app state before the next. Never repeat a split blindly.
- Export with the app export dialog and verify the file name, duration and size. Rendering can take time: wait on the progress state, not a fixed delay.
- Uploading personal media or publishing needs the user's approval.`,
  },
  {
    verified: 'live',
    md: `---
name: forms-and-business-apps
description: Fill and submit web forms and business app screens in one pass: fields by role and name, dialogs dismissed, one submission, result read back.
license: Xroga-internal
metadata:
  domain: forms
  hosts: ""
  keywords: form fill submit field checkbox radio select order register apply contact booking input textarea
  requires: browser
  risk: write
  docs: ""
---
- Take one snapshot, dismiss any blocking dialog or banner, then fill every field with a single fill_form call using role and name targets.
- Read the values back before submitting. Submit once; a duplicate submission is a duplicate record.
- Read the confirmation or resulting page and report exactly what it shows.
- Consequential forms (payment, account creation, applications, messages) need the user's approval before the final submit.`,
  },
  // Adapted 2026-11-23 from boringmarketer/boring-marketing-skills @ 7c6678c (MIT, Boring Marketing, LLC), skills/google-business-profile, as collected in
  // sickn33/agentic-awesome-skills @ f6f68685. Rewritten for browser execution; no scripts, keys or paid services.
  {
    verified: 'curated',
    md: `---
name: google-business-profile
description: Audit or complete a Google Business Profile (Maps listing) against the businesses that win the local map pack, fix what loses calls, and draft posts.
license: MIT (adapted from boringmarketer/boring-marketing-skills)
metadata:
  domain: local-business
  hosts: business.google.com
  keywords: google business profile gbp google my business maps listing map pack local seo reviews categories service area posts
  requires: browser
  risk: write
  docs: ""
---
- Search the way customers do: the main service alone, "[service] near me" and "[service] [city]", from the city centre and the area around the business. Note query, place, date for each look.
- Compare the business with the top 3 on the same fields: name as shown, primary category, rating and review count, reviews per month and owner reply share, photo count and newest date, newest post, hours, services, the page the website button opens, distance.
- Fix risks first: the name must match real signage (no added keywords or city), a business serving customers at their address hides it and lists service areas, every phone number on the profile reaches someone, the website link carries tracking (utm_source=google, utm_medium=organic, utm_campaign=gbp), every button works, messages and suggested edits reach someone, hours (including holidays) are true.
- Then rank gaps: primary category against the top 3, review pace and replies, real job photos, description, hours, offers. Distance is stated, not fought.
- Posts: one a week from real jobs, seasonal prevention, real questions or a real offer with an end date; the point in the first two lines, no phone number in the text, a real photo screened for faces, plates and addresses.
- Every change to the live profile and every post is published only with the owner's approval; facts only the owner knows (hours, services, offers) are asked, never invented.`,
  },
  {
    verified: 'curated',
    md: `---
name: business-presence-setup
description: Create or complete the public presence of a business (a social Page, a profile, a listing) from what the business really offers: identity, contact, services, buttons, messaging, first post.
license: Xroga-internal
metadata:
  domain: business-presence
  hosts: facebook.com business.facebook.com instagram.com linkedin.com business.google.com
  keywords: business page profile listing facebook page instagram business linkedin company page about bio contact button services greeting auto reply cover logo
  requires: browser
  risk: write
  docs: ""
---
- Read the business first (its website, earlier conversation, attached files): name, category, what it sells, area, real contact details. Never invent a phone number, address, price or claim; ask for what is missing.
- Create or find the page without making a duplicate (search the account's pages first). If a name is refused, use the closest name the site suggests.
- Fill identity and contact in one pass per form, then services, the main action button (call, message, book) and the messaging greeting or instant reply; leave publishing posts and anything paid to the owner's approval.
- Check that each saved value shows after a reload, that every phone number on the page is the same one, and that buttons open the right place. Record the values you depend on with plan fact and settle any two that differ.
- Finish with what is saved, what waits on the owner (codes, payments, missing facts) and what was left unpublished.`,
  },
  {
    verified: 'curated',
    md: `---
name: research-with-sources
description: Research a question on the web: read several sources in parallel, cross-check facts, and answer with citations and the date of each source.
license: Xroga-internal
metadata:
  domain: research
  hosts: ""
  keywords: research compare sources find information search articles summarize citations facts price
  requires: browser
  risk: read
  docs: ""
---
- Use delegate to read several pages at once instead of opening them one by one.
- Prefer primary sources (official docs, filings, the vendor site). Note the publication or update date.
- State disagreements between sources instead of picking silently. Say what could not be confirmed.
- Quote sparingly and name the source for every claim.`,
  },
  {
    verified: 'curated',
    md: `---
name: files-download-upload-export
description: Handle files in the browser: upload attachments to a form, download and verify an export, and report the exact file name and contents summary.
license: Xroga-internal
metadata:
  domain: files
  hosts: ""
  keywords: upload download export file attachment pdf csv image save report document
  requires: browser
  risk: write
  docs: ""
---
- Uploads: use the upload tool with the attached file; confirm the page shows the file name afterwards.
- Downloads: trigger the export, then call confirm_download and report the file name; open or parse the file to check its contents when it is readable.
- A saved file is not proof of correctness: check page size, row counts or key values against the request.
- Uploading personal or sensitive files to a site needs the user's approval for that file and that site.`,
  },
];

export interface SkillCard {
  id: string;
  title: string;
  summary: string;
  domain: string;
  hosts: string[];
  keywords: string[];
  requires: string[];
  risk: string;
  docs: string[];
  verified: Verified;
  body: string;
  skill: SkillMd;
}

function load(): SkillCard[] {
  const cards: SkillCard[] = [];
  for (const source of SOURCES) {
    const parsed = parseSkillMd(source.md);
    if (!parsed.ok) throw new Error(`bundled skill is invalid: ${parsed.error}`);
    const { skill } = parsed;
    const m = skill.metadata;
    const list = (v: string | undefined) => (v ?? '').split(/\s+/).filter(Boolean);
    cards.push({
      id: skill.name,
      title: skill.name.replace(/-/g, ' '),
      summary: skill.description,
      domain: m.domain ?? 'general',
      hosts: list(m.hosts?.replace(/^""$/, '')),
      keywords: list(m.keywords),
      requires: list(m.requires),
      risk: m.risk ?? 'read',
      docs: list(m.docs?.replace(/^""$/, '')),
      verified: source.verified,
      body: skill.body,
      skill,
    });
  }
  return cards;
}

export const SKILL_CATALOG: readonly SkillCard[] = load();

const STOP = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'from', 'into', 'then', 'all', 'one', 'new', 'use', 'please', 'make', 'create', 'open', 'page', 'tab', 'my']);
const tokens = (s: string): string[] => (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(t => t.length > 2 && !STOP.has(t));

export interface SkillHit {
  card: SkillCard;
  score: number;
}

/** Ranks cards for a task and the page the run is on. A host match is strong evidence; text matches are weighted by where they occur. */
export function searchSkills(query: string, options: { host?: string; url?: string; limit?: number } = {}): SkillHit[] {
  const q = tokens(query);
  // The page identity is parsed, never matched by substring: a host rule matches on a label boundary only (see site-context.ts).
  const id = options.url ? identify(options.url) : options.host ? identify('https://' + options.host) : null;
  const hits: SkillHit[] = [];
  for (const card of SKILL_CATALOG) {
    let score = 0;
    const nameTokens = new Set(tokens(card.id));
    const kw = new Set(card.keywords);
    const desc = new Set(tokens(card.summary));
    for (const t of q) {
      if (nameTokens.has(t)) score += 3;
      if (kw.has(t)) score += 2;
      if (desc.has(t)) score += 1;
    }
    if (id && card.hosts.some(h => matchSite({ host: h }, id).matched)) score += 6;
    if (score > 0) hits.push({ card, score });
  }
  hits.sort((a, b) => b.score - a.score || a.card.id.localeCompare(b.card.id));
  return hits.slice(0, options.limit ?? 3);
}

export function skillById(id: string): SkillCard | undefined {
  return SKILL_CATALOG.find(c => c.id === id);
}

/** A card small enough to cost little in a model turn: what it is, how far it has been proven, what it needs and the risk. */
/** What a skill relies on, checked against the tools this run actually has: a connected app (plugin tools), a backend worker (repository runner), the browser. */
export function availability(card: SkillCard, toolNames: ReadonlySet<string>): string {
  const parts: string[] = [];
  for (const need of card.requires.length ? card.requires : ['browser']) {
    if (need === 'connected_app') parts.push(`connected app ${[...toolNames].some(n => n.startsWith('plugin_')) ? 'available' : 'NOT available (use the browser)'}`);
    else if (need === 'backend_worker') parts.push(`backend worker ${toolNames.has('run_repository') ? 'available' : 'NOT available'}`);
    else parts.push('browser available');
  }
  return parts.join(', ');
}

export function describeHit(hit: SkillHit, toolNames?: ReadonlySet<string>): string {
  const c = hit.card;
  const avail = toolNames ? `; ${availability(c, toolNames)}` : '';
  return `- ${c.id} (${c.domain}, ${c.verified}, risk ${c.risk}, needs ${c.requires.join('+') || 'browser'}${avail}): ${c.summary}`;
}

export function renderSkill(card: SkillCard): string {
  const docs = card.docs.length ? `\nOfficial documentation (read with http_get when you need exact details): ${card.docs.join(' ')}` : '';
  return `Skill ${card.id} [${card.verified}, risk ${card.risk}]. This is guidance only; it grants no permission, and every action still follows the run's tools and approvals.\n${card.body}${docs}`;
}

export const FIND_SKILL_TOOL = {
  name: 'find_skill',
  source: 'agent' as const,
  group: 'reading' as const,
  description:
    'Optional help, never a requirement or a limit: if no skill matches, carry on with your own reasoning and the universal tools. Find expert skills for the task from a catalog of professional workflows (advertising, e-commerce, CRM, office, coding, SEO, data, graphics, video, research, forms, files). ' +
    'Returns up to 3 short cards ranked by the task and the current page. Then call read_skill for the one you need. Use it for an unfamiliar professional application or a domain task you are not sure how to do.',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string', maxLength: 300 } },
    required: ['query'],
    additionalProperties: false,
  },
};

export const READ_SKILL_TOOL = {
  name: 'read_skill',
  source: 'agent' as const,
  group: 'reading' as const,
  description: 'Read one skill by id (from find_skill): its method, verification rules, approval rules and official documentation links.',
  parameters: {
    type: 'object',
    properties: { id: { type: 'string', maxLength: 80 } },
    required: ['id'],
    additionalProperties: false,
  },
};
