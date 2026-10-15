# S03 V12: Search & Visibility coverage

This updates the V11 coverage map. V12 makes no change to scope; it changes how keyword research and AI-answer visibility are shown (see the rows marked **V12**).

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
| Keyword research and intent (**V12**) | Shown | A compact cluster of every buyer search, ordered Buy / Compare / Learn / Nearby. The chosen intent is bright; the others stay present but muted. Above the cluster, each data source sits beside its job: "Your own searches: Search Console", "Demand: Semrush", "Competitor pages: Ahrefs". | Search Console (first-party queries), Semrush (demand), Ahrefs (competitor pages) | Each source shows its true status (INTEGRATION_TRUTH.md). "Illustrative searches; no volumes are quoted." |
| Competitor evidence → content gap → brief → approval → post-publish check (**V12**) | Shown | The chosen search runs left to right: the competitor page that answers it ("Also cited in the AI answer" for the buyer question) → "Not on your site" → PeakForm's empty slot. "Prepare page brief" turns the slot into a draft (heading, sections, FAQ, facts, links), ending in "Needs your approval → publish → check results after publishing". | — | "Page brief · draft"; no ranking is promised |
| AEO (answer engines) (**V12**) | Shown | Tag "AI shopping question", then "Which whey protein should I buy for the gym?". The illustrative answer gives neutral buying criteria (protein per serving, ingredients and allergens, batch testing, price per serving and stock). Two numbered "Cited source" cards are joined to their sentences by anchored, low-contrast lines that sit behind the cards and brighten when selected. A third brand is "Brand mentioned, not cited". | No AI-answer data provider is in Xroga's directory; the lens says so | "Illustrative AI answer"; the method note says nothing guarantees a mention or a citation |
| GEO (generative answers) (**V12**) | Shown | PeakForm's product card is isolated and unconnected: "Not cited in this checked example". Four missing fields: protein per serving, ingredients and allergens, price per serving, testing documentation (lab report, where one exists). "Improve product page" drafts them ("Draft · awaiting approval"), plus a comparison FAQ, product structured data and links from guides. Then: "Ready to publish after review" and "Recheck mentions & citations · needs a connected source". | Same | The recheck says no new result is shown; PeakForm never becomes "recommended" |
| AI visibility measurement | On request | The recheck explains what would be compared after approval and publishing | Same | Stated as a plan, not a measurement |
| Search result vs quick answer vs AI answer | On request | Three one-line definitions in the AI inspector | — | — |
| Backlinks: verified vs competitor-only | Shown (signature graph) | One verified link to PeakForm; three relevant publishers that link only to the competitor (Ironwhey). For the chosen one, an open dotted line that never arrives: "No link from liftmag.example yet". | Ahrefs (link intersect), Semrush (backlink audit) | Only a re-check of the live page marks a link verified |
| Mentions and digital PR | Shown | An unlinked forum mention (open line); an opportunity to contact (no line); "Prepare outreach" writes a specific angle as a draft | — | "Draft · awaiting your review"; nothing is sent; a draft is not a link |
| Link spam | Shown | `linkfarm-seo.example` is "Unsuitable · excluded" because buying links breaks search policies | — | No outreach is offered for it |
| Local SEO | Shown | Map and listing for "whey protein shop near me". One missing detail (Saturday hours) and one proposed correction, matched to the store page. | Business Profile (not currently supported) | "Map listing · not an AI-answer citation"; the correction needs the owner's sign-in and approval; no ratings or map rank |
| International and e-commerce at scale | Not shown | Out of scope for one example | — | — |

## Provider truth
See INTEGRATION_TRUTH.md. In short: Ahrefs, Semrush, Google Ads, Meta, HubSpot and Google Analytics are "Available to connect"; Search Console, Tag Manager and Business Profile are "Not currently supported"; no AI-answer provider is listed; nothing shows as connected.

## The guided tour (Search & Visibility part)
See ANIMATION_STORYBOARD.md: seven Search beats (Found → Compared → Found → Prepared → Found → Prepared → Needs approval), then three Launch & Marketing beats; 20.5 s in total on desktop.
