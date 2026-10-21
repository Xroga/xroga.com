# S03 V11: Search & Visibility coverage

**One example business across all five lenses:** PeakForm Nutrition, a fictional sports-nutrition brand with an online store (`peakform.example`) and a shop in Leeds. Every finding belongs to the same story:
- The broken link is to its whey product page.
- The keyword gap is the same buyer question the AI lens asks.
- The backlink gap is a protein buying guide.
- The local issue is the same shop whose page the crawl found hidden.

Launch & Marketing keeps its approved example, Ember Roasters.

**Labels used below:**
- **Shown:** visible and interactive on the homepage.
- **On request:** one click away, in the inspector or a provider note.
- **Not shown:** left out deliberately.

All data is illustrative; nothing is crawled, queried or connected.

| Discipline | In S03 | What the visitor sees and can do | Where real data would come from | Honest limits shown |
|---|---|---|---|---|
| Technical SEO: crawlability, status codes | Shown | "Inspect crawl" sends one tracer over 8 pages and 8 internal links. It stops at the broken link: `/protein/whey-isolate` returns 404, "This product page returns 404." | Search Console (crawl, indexing), Semrush site audit | "Proposed · not applied"; the repair is a draft and the retest is a separate step |
| Indexability | Shown | `/stores/leeds` is "noindex · by mistake"; `/account` is "noindex · on purpose" (quiet, not an issue) | Search Console URL inspection | Same |
| Speed on mobile | Shown | `/guides/beginners` "opens, but slowly on phones": reachable and indexable, unlike the 404 | Field data or audit, once connected | No score or timing is quoted |
| Internal links, redirects | Shown | The repair points the link at the new URL and redirects the old one | — | Draft only |
| Structured data | Shown (AI lens) | Product structured data is drafted with the product facts | — | Shown as an expert detail, never as a ranking badge |
| Canonicals, sitemaps, metadata | Not shown | Left out so each scene keeps one dominant issue | — | — |
| Keyword research and intent | Shown | Buyer searches grouped Compare / Buy / Local / Learn. The chosen search runs: who answers it today → PeakForm's page or empty slot. | Search Console (your own queries), Semrush (demand), Ahrefs (competitor pages), named under the stage with honest availability | "Example searches"; no search volumes are quoted |
| Content gap and page brief | Shown | "Prepare page brief" shapes the empty slot into a draft: heading, three sections, a FAQ, product facts, internal links | — | "Page brief · draft for review"; no ranking promised |
| AEO (answer engines) | Shown | The buyer asks "Which whey protein should I buy for the gym?". The answer cites a buying guide and a product page, and names a brand without citing it. PeakForm's product page sits below, not connected, with "Missing clear product details." | No AI-answer data provider is in Xroga's directory; the lens says so | "AI answer · illustrative"; the method note says nothing guarantees a mention or a citation |
| GEO (generative answers) | Shown | Cited, "Mentioned · not cited", "Not mentioned or cited" and "Not checked yet" are separate states. "Improve product page" drafts three facts plus structured data; "Recheck AI visibility" is planned, not run. | Same | "Recheck planned … no new result is shown"; there is no recommendation, citation or ranking claim |
| AI visibility measurement | On request | The recheck explains what would be compared after approval and publishing | Same | Stated as a plan, not a measurement |
| Search result vs quick answer vs AI answer | On request | Three one-line definitions in the AI inspector | — | — |
| Backlinks: verified vs competitor-only | Shown (signature graph) | One verified link to PeakForm; three relevant publishers that link only to the competitor (Ironwhey). For the chosen one, an open dotted line that never arrives: "No link from liftmag.example yet". | Ahrefs (link intersect), Semrush (backlink audit) | Only a re-check of the live page marks a link verified |
| Mentions and digital PR | Shown | An unlinked forum mention (open line); an opportunity to contact (no line); "Prepare outreach" writes a specific angle as a draft | — | "Draft · awaiting your review"; nothing is sent; a draft is not a link |
| Link spam | Shown | `linkfarm-seo.example` is "Unsuitable · excluded" because buying links breaks search policies | — | No outreach is offered for it |
| Local SEO | Shown | Map and listing for "whey protein shop near me". One missing detail (Saturday hours) and one proposed correction, matched to the store page. | Business Profile (not in Xroga's directory; shown as an example) | "Map listing · not an AI-answer citation"; the correction needs the owner's sign-in and approval; no ratings or map rank |
| International and e-commerce at scale | Not shown | Out of scope for one example | — | — |

## Provider truth
Statuses mirror `src/lib/integrations-catalog.ts`.
- **Available to connect:** Ahrefs, Semrush, Google Ads, Meta, HubSpot and Google Analytics.
- **"Not in directory · example":** Search Console, Tag Manager and Business Profile.
- **AI answers:** no AI-answer data provider is listed, and the lens says so. ChatGPT and other assistants are not named or shown.
- **No provider anywhere shows as connected.**

## The guided tour (Search & Visibility part)
| # | Caption | What the stage does |
|---|---|---|
| 1 | Noticed · Found a page customers can’t open. | The crawl tracer stops at the broken whey product link |
| 2 | Noticed · Found a search your site doesn’t answer. | The buyer question, the competitor page and the empty slot; the page brief is drafted at 1.3 s |
| 3 | Noticed · Checking how AI answers find product information. | Question, then answer, sources and citation lines, then PeakForm's unconnected product page and its finding |
| 4 | Prepared · Better product facts, ready for review and a recheck. | Product facts and structured data drafted; recheck planned |
| 5 | Noticed · Found a relevant site linking to a competitor. | Competitor gap and the missing-link line to PeakForm |
| 6 | Prepared · An outreach angle, drafted for your review. | Outreach draft; the graph steps back behind it |
| 7 | For review · Prepared a local listing correction. | The Saturday-hours correction, drafted |

The tour then continues into the four approved Launch & Marketing beats.
