# S03 V12: integration truth

Every provider shown in S03 uses one of three statuses, taken from Xroga's integrations directory (`frontend/src/lib/integrations-catalog.ts`). The homepage reads no account and calls no provider API. No provider chip can ever show a signed-in state.

| Status shown | When it is used |
|---|---|
| **Available to connect** | The provider is listed in the directory. On this homepage that always means `not_connected`, because no visitor account exists. |
| **Connected and authorized** | Never shown on the homepage. Showing it would need a real, verified, authorized connection, and the demo has none. |
| **Not currently supported** | The provider is not in the directory. This replaces V11's "Not in directory · example". |

## Providers in S03

| Provider (S03 name) | Directory entry | Directory status | Shown as | Where it appears, beside the work it would feed |
|---|---|---|---|---|
| Ahrefs | "Ahrefs" | `not_connected` | Available to connect | Find search opportunities: "Competitor pages: Ahrefs". Earn authority: tools strip; the popover reads "Referring domains, link intersect and competitor pages". |
| Semrush | "SEMrush" | `not_connected` | Available to connect | Find search opportunities: "Demand: Semrush". Fix my website, Earn authority and Build search ads: tools strip. |
| Search Console | not listed | — | Not currently supported | Find search opportunities: "Your own searches: Search Console". Fix my website and Show up locally: tools strip. |
| Business Profile | not listed | — | Not currently supported | Show up locally |
| Google Ads | "Google Ads API" | `not_connected` | Available to connect | Build search ads |
| Meta Ads | "Meta Business Suite" | `not_connected` | Available to connect | Create social ads |
| HubSpot | "HubSpot" | `not_connected` | Available to connect | Trace conversions (leads and follow-up) |
| Google Analytics | "Google Analytics" | `not_connected` | Available to connect | Launch a product, Trace conversions |
| Tag Manager | not listed | — | Not currently supported | Launch a product, Trace conversions |
| AI-answer data provider | none in the directory | — | The lens says "No AI-answer data provider is in Xroga's directory" | Appear in AI answers. "Recheck mentions & citations" is labelled "needs a connected source", and the recheck note says no new result is shown. |

## Wording that is deliberately absent

The S03 source has no "Ahrefs analyzed", "Semrush analyzed" or "Connected and authorized". A unit test enforces this (V12-03, `s03.test.ts`).

No volumes, rankings, traffic, revenue, leads, ad spend or AI placements are presented as real. The keyword inspector says: "Illustrative searches; no volumes are quoted."

Each draft (repair, page brief, product facts, outreach note, listing correction, campaign) is labelled draft / awaiting approval. Nothing in S03 claims to have published, sent, launched or spent anything; QA "Nothing in the tour claims to have published, sent or launched" checks this.

## Evidence

- `04-1440-search-opportunities.jpg` and `05-1440-search-opportunities-brief.jpg`: the keyword lens with the three data sources and their statuses.
- QA checks:
  - "A provider names what Xroga would read and its honest availability" (Ahrefs, Available to connect, Listed as "Ahrefs")
  - "Business Profile is shown as not currently supported"
  - "HubSpot shows its job and availability"
  - "Tag Manager is shown as not currently supported"
