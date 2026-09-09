# Structured data specification

All JSON-LD must match visible page content and use canonical `https://xroga.com` identifiers.

| Schema | Placement | Purpose |
|---|---|---|
| Organization + Person | root site graph | identify Xroga and its documented founder/contact entity |
| WebSite | root site graph | identify the canonical website; no SearchAction |
| SoftwareApplication | root site graph | describe Xroga and visible Free/Xroga Pro offers; no ratings |
| WebPage / CollectionPage | public pages/hubs | identify the canonical page and relationship to the site |
| BreadcrumbList | new SEO detail pages | mirror the visible breadcrumb hierarchy |
| Article | `/blog/[slug]` | headline, description, author, real publish/modified dates |

Deliberately absent: AggregateRating, Review, unsupported Product claims, HowTo rich-result markup, and sitelinks SearchAction. FAQ copy may remain visible where useful, but general FAQ rich-result eligibility is not assumed.

Validation: the SEO crawler parses every JSON-LD block on priority routes and fails malformed data or missing required types.
