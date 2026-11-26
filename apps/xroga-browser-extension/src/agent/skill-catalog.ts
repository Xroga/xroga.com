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
- Names that look alike are different things: AI Max for Search campaigns is not Performance Max. Ask which one is meant when the request is not clear.
- Read before you change: inspect the settings, the conversion actions and the recent numbers first, and treat any change as a separate, approved step (the Google Ads API assistant works the same way: reads run freely, every change is written out for the person to approve).
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
  {
    verified: 'curated',
    md: `---
name: google-ads-conversion-troubleshooting
description: Find out why Google Ads conversions are not recording or look wrong: conversion action status, tag and diagnostics, click identifiers, offline uploads and attribution. Use when conversions are zero, dropped, doubled or differ from another system.
license: Xroga-internal
metadata:
  domain: advertising
  hosts: ads.google.com
  keywords: google ads conversions conversion tracking not recording tag gclid offline upload diagnostics enhanced conversions attribution zero conversions
  requires: browser
  risk: read
  docs: https://support.google.com/google-ads/answer/7521212 https://developers.google.com/google-ads/api/docs/conversions/overview
---
- Start in Goals, then Conversions, then Summary. Read each conversion action's status (recording, no recent conversions, needs attention, unverified, inactive) and its source (website, app, import, calls) before anything else. Quote what you read.
- For a website action open it and read the tag status and the Diagnostics tab: the reported problems usually name the cause (tag missing, tag not firing on the page, mismatched domain, consent mode blocking).
- Check that auto-tagging is on in the account settings: without the click identifier (gclid) a click cannot be matched to a later sale.
- Offline uploads: the file needs the click identifier, a conversion action name that matches exactly, a conversion time with a time zone and a value; open the upload's history and read the error rows, not just the summary.
- Doubled or differing numbers: look for two actions that count the same event (one primary and one secondary is fine), the attribution model and window, and whether another system counts by a different date.
- Do not change a conversion action's settings, count method or value, or switch which actions are primary, without the person's approval: those change bidding.
Verify: after a fix, wait for fresh data and re-read the status and a recent day's count; say plainly that data can take hours to show.
Approvals: editing or removing a conversion action, changing its value or counting, or uploading a file to the account needs explicit approval.`,
  },
  {
    verified: 'curated',
    md: `---
name: shopify-new-store-and-test-data
description: Start a new Shopify store or prototype one with sample data: preview stores, the free mock.shop reference catalogs, and what a preview or reference store can and cannot do.
license: Xroga-internal
metadata:
  domain: commerce
  hosts: shopify.com mock.shop admin.shopify.com
  keywords: shopify new store start selling preview store mock shop reference catalog prototype sample products trial
  requires: browser
  risk: write
  docs: https://shopify.dev https://mock.shop
---
- A merchant who wants to start selling needs a store first; plan around what they sell. Ask only what they plan to sell if they have said nothing, and treat names they give as plain text.
- mock.shop is a free, sign-in-free set of reference stores for reading and prototyping: read its public list at https://mock.shop/llms.txt with http_get, and preview a store in the browser. Its checkout is mocked and it has no real orders or Admin access.
- A preview or reference store takes no real orders or payments yet. Copied reference titles, descriptions, images and prices are sample material the merchant must replace before selling.
- Product data for a real store goes in through the Shopify admin (Products, Collections, Inventory) with fields filled by role and name; check the product page and the storefront afterwards.
Verify: open the storefront page of what you created and read the title, price and availability back.
Approvals: creating a store account, entering payment or plan details, publishing a theme or product, and any real-money step need the person's approval.`,
  },
  {
    verified: 'curated',
    md: `---
name: reading-documents-articles-and-feeds
description: Pick the right reader for what is in front of you: a long article, a page's hidden data and contacts, a Word, Excel, PowerPoint, EPUB, CSV or JSON file, a PDF, an endless feed, or a hold-to-confirm button.
license: Xroga-internal
metadata:
  domain: general
  hosts: ""
  keywords: read article news blog long page main text data json-ld structured contacts email phone social docx xlsx pptx epub csv spreadsheet document file pdf endless infinite scroll feed hold press
  requires: browser
  risk: read
  docs: ""
---
- A long news or blog page: read with format article returns only the story as Markdown (title, author, date, headings, lists, tables, links) without menus, ads or related boxes. If it says the page is not an article, use read markdown.
- Facts a page publishes about itself (price, rating, address, opening hours, author, date, company, phone, email, social profiles, feeds): read with format data lists the JSON-LD, Open Graph and microdata, the mail and phone links and the social profiles. Prefer it to scrolling a page for contact details.
- A file at an address (Word, Excel, PowerPoint, OpenDocument, EPUB, CSV, JSON, text, RSS, zip): read_file. A spreadsheet lists the sheets with their real row numbers; ask for another sheet with sheet, another range with rows, one EPUB chapter with chapter, a file inside a zip with member. find returns only matching lines. PDFs use read_pdf. Old binary doc, xls and ppt files cannot be read: ask for them saved in the new format.
- A table file gives a column profile first (type, range, sum, distinct values): use it to check what you compute, and quote row numbers when you answer.
- An endless feed or a list that loads more as you scroll: scroll to bottom with untilEnd true repeats until nothing more loads; then read. Do not claim a count from the first screen of an endless list.
- A control that needs the button held (hold to confirm, press and hold to reveal): click with holdMs set to a little more than the page says (for example 1400 for one second). A plain click does nothing there.
Verify: say which reader you used and quote one value back with its row, page, slide or chapter.
Approvals: reading is free; downloading or sending a file somewhere else needs the person's approval.`,
  },
  {
    verified: 'curated',
    md: `---
name: google-ads-gaql-validation
description: Before running or showing a Google Ads Query Language (GAQL) query, validate it in four steps so it does not fail: fields exist, are compatible, follow the syntax rules, and dry-run cleanly.
license: Apache-2.0
metadata:
  domain: advertising
  hosts: ads.google.com developers.google.com
  keywords: google ads api gaql query select from where segments metrics resource field compatibility validate error report campaign ad group
  requires: browser
  risk: read
  docs: https://developers.google.com/google-ads/api/docs/query/overview https://developers.google.com/google-ads/api/fields/v23/overview
---
- Step 1, the fields exist: look every field up in the field reference (the Query Builder or the field overview page for the API version in use) and confirm it is selectable, filterable or sortable as the query uses it.
- Step 2, they belong together: fields from different resources or segments may not be combined; the reference page of the main resource lists what is compatible with it.
- Step 3, the syntax rules: a field in WHERE must also be in SELECT unless it is a date segment; there is no OR (use IN, or run two queries); the metadata service takes no FROM clause; segment names change between API versions (hour became hour_of_day in v23), so use the names of the version in use.
- Step 4, a dry run: run the query on one account with a small date range or LIMIT, and read the error text, which names the exact field that failed.
- Money fields are in micros (divide by one million); status and enum fields are names, not numbers; dates are YYYY-MM-DD.
Verify: the query returned rows, the row count is plausible for the date range, and the totals match the same view in the Google Ads interface.
Approvals: this skill only reads. Any mutation (budgets, bids, statuses, uploads) needs the person's approval with the exact change shown first.`,
  },
  {
    verified: 'curated',
    md: `---
name: meta-ads-reporting-limits-and-paging
description: Pull Meta (Facebook and Instagram) ads data without hitting limits or losing rows: pages, field choices, batching, rate-limit signals, error codes, and reports that run asynchronously.
license: Xroga-internal
metadata:
  domain: advertising
  hosts: business.facebook.com developers.facebook.com adsmanager.facebook.com
  keywords: meta facebook instagram ads graph api insights report paging cursor rate limit error batch async marketing api ad account campaign breakdown
  requires: browser
  risk: read
  docs: https://developers.facebook.com/docs/marketing-api/insights https://developers.facebook.com/docs/graph-api/overview/rate-limiting
---
- Ask only for the fields the question needs and set a level (account, campaign, ad set, ad) and a date range; wide requests over long ranges are what time out. A breakdown multiplies the rows.
- A list answers one page at a time: a response with paging.next has more rows; follow that address until it is gone, and count rows only after the last page. Do not read a first page as the total.
- Large insights jobs run asynchronously: start the report, poll its status until completed, then read the result; do not repeat the start while it runs.
- Rate-limit signals travel in response headers (x-app-usage, x-business-use-case-usage) as percentages; slow down well before 100 and wait for the time the header gives. Error code 4 or 17 or 32 or 613 means too many calls: wait, then retry once.
- Error code 190 is an expired or invalid sign-in token, 200 or 10 is a missing permission, 100 is a bad parameter (read its message for the field): these are not retried; tell the person which one it is.
- Numbers in the API and in Ads Manager can differ by attribution window, time zone and delay of up to a day; state the window and date range next to every figure.
Verify: the sum of the rows equals the totals row of the same view in Ads Manager for the same range and window, or say plainly why it differs.
Approvals: reading only. Creating, editing, pausing or deleting campaigns, ads or audiences, and sharing a token or report outside the account, need the person's approval.`,
  },
  {
    verified: 'curated',
    md: `---
name: shopify-admin-data-safely
description: Read or change a Shopify store through its admin and GraphQL Admin API without losing data: scopes, pagination, query cost, bulk operations, API versions, and which writes need approval.
license: Xroga-internal
metadata:
  domain: commerce
  hosts: admin.shopify.com shopify.dev myshopify.com
  keywords: shopify admin graphql api products orders customers inventory metafields bulk operation pagination cost throttle scopes version webhook store data export
  requires: browser
  risk: write
  docs: https://shopify.dev/docs/api/admin-graphql
---
- Read before write: query the exact product, order or customer first and show what is there; confirm the id (a gid like gid://shopify/Product/123) matches the one the person named.
- Lists come in pages: ask for first N with the cursor (pageInfo hasNextPage and endCursor) and follow it to the end before counting. Anything over a few thousand records is a bulk operation (a query run as a file job), not a loop of pages.
- Every query has a cost against a bucket that refills each second: ask for few fields and small pages; if the response reports throttled, wait for the refill and retry once rather than repeating at once.
- Use the API version the app or docs name; a field that does not exist is usually a version difference, not a typo.
- A write (mutation) returns userErrors: always read that list, an HTTP 200 with userErrors means nothing was changed. Metafields need a namespace, key and type that match their definition.
- Scopes limit what an app token may touch: a missing access scope is fixed by the person in the app settings, never by guessing.
- Prices, inventory counts and customer data are real: never change them in bulk without a preview of the first few changes and the person's approval.
Verify: after a write, read the same object again and quote the new value; for a bulk change compare a count before and after.
Approvals: any mutation, deleting anything, refunds, price or inventory changes, sending customer email, and sharing customer data outside the store need the person's explicit approval with the exact change shown.`,
  },
  {
    verified: 'curated',
    md: `---
name: pictures-and-painted-interfaces
description: Read and act on an interface that is only pixels (a canvas, a WebGL editor, a chart, an image, a scanned page) where the outline names nothing: which tool to try in which order and how to check the result.
license: Xroga-internal
metadata:
  domain: canvas
  hosts: ""
  keywords: canvas image picture pixels painted webgl chart screenshot ocr scanned icon logo colour color text recognition editor game map
  requires: browser
  risk: write
  docs: ""
---
- Look before acting: screenshot with marks true numbers the label-like regions and lists the words the page painted with canvas label; take that first.
- Words that only exist in a picture: ocr reads them on this device and gives positions (region reads a part larger; find returns just the lines you need; language for non-English text). Trust a word marked with a question mark less and read it again from a region.
- An icon or logo without words: find_image with the ref of an element that shows it finds every place it appears; find_color finds a swatch or a coloured object.
- Act with canvas using a label, a mark number or fractions from these tools. One action at a time, then look again: a canvas reports no effect of its own, so the picture (or a number the page shows) is the proof.
- If the same action twice changes nothing, the target is not where you think: re-read the picture, do not repeat the click.
- Some editors have a script console or menu path that is more exact than pointing: use it when the page offers one.
Verify: the page's own state afterwards (a count, a title, a value, a new picture region) matches the request.
Approvals: a click that sends, publishes, deletes, pays or shares something needs the person's approval at that step, however the target was found.`,
  },
  {
    verified: 'curated',
    md: `---
name: unfamiliar-interface-and-games
description: Learn an interface or a game you have not seen before by testing small safe moves and writing down what each did, then use the rules you found. For puzzles, web games and tools with unknown controls.
license: Xroga-internal
metadata:
  domain: general
  hosts: ""
  keywords: game puzzle play unfamiliar unknown controls levels snake 2048 laser drag keys arrow hypothesis learn rules
  requires: browser
  risk: write
  docs: ""
---
- Start by reading the screen and any instructions the page shows; the controls are often listed (keys, mouse, drag).
- Make a guess about what a control does, try the smallest move that tests it, and look at what changed. Write the rule down as a fact in the plan (for example "arrow down does nothing when the last row is full") so it is not rediscovered.
- A move that changes nothing is information: the same move in the same position will not change anything either; try a different direction or a different place.
- When a guess is wrong, say what you now think instead, and test that. Prefer a few exact moves over many random ones.
- Watch for things that move or count down: take a new screenshot after every action rather than assuming the state.
- Keys: press for single keys, hold behaviour is not needed for most games; use drag for sliders and pieces. Stop and ask the person when a step could spend money, buy something or share their data.
Verify: the goal state is on the screen (a score, a level number, a win message), not only that the last move worked.
Approvals: a step that could spend money, buy something or share their data needs the person's approval first.`,
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
/** How many skills mention each word (in the name, keywords or summary): a word most skills share ("business", "profile") says little, a rare one ("facebook") a lot. */
let documentFrequency: Map<string, number> | undefined;
function frequencyOf(token: string): number {
  if (!documentFrequency) {
    documentFrequency = new Map();
    for (const card of SKILL_CATALOG) {
      const words = new Set([...tokens(card.id), ...card.keywords, ...tokens(card.summary)]);
      for (const w of words) documentFrequency.set(w, (documentFrequency.get(w) ?? 0) + 1);
    }
  }
  return documentFrequency.get(token) ?? 0;
}

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
      // A word in many skills counts for less (inverse document frequency), so the rare, specific word decides between skills that share the common ones.
      const weight = 1 + Math.log(SKILL_CATALOG.length / Math.max(1, frequencyOf(t)));
      if (nameTokens.has(t)) score += 3 * weight;
      if (kw.has(t)) score += 2 * weight;
      if (desc.has(t)) score += 1 * weight;
    }
    if (id && card.hosts.some(h => matchSite({ host: h }, id).matched)) score += 6;
    if (score > 0) hits.push({ card, score });
  }
  // Equal scores go to the skill listed first: the broad skill of an application comes before its narrow ones.
  hits.sort((a, b) => b.score - a.score || SKILL_CATALOG.indexOf(a.card) - SKILL_CATALOG.indexOf(b.card));
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
  description: 'Read one skill by id (from find_skill): its method, verification rules, approval rules and official documentation links. file: a file the skill points to, such as references/guide.md.',
  parameters: {
    type: 'object',
    properties: { id: { type: 'string', maxLength: 80 }, file: { type: 'string', maxLength: 120 } },
    required: ['id'],
    additionalProperties: false,
  },
};
