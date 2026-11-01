# Response V2 composition grammar

Status: implementation specification, not visual acceptance or production evidence.

## Information contract

The existing authenticated message adapter remains the sole input. Parse prose
with the same Markdown grammar used for rendering. Build nested sections from
actual heading nodes, and retain exact source offsets for every body fragment.
Reference definitions remain in the document context so splitting a section
cannot break links or footnotes. Never infer a title, conclusion, price, source,
task success, domain, or chart series from keywords.

Each semantic unit records its original node, role, source range where applicable,
and supported evidence relationships. Roles include narrative, steps, comparison,
series, scenario, resource, workflow, code, mathematics, notice and progress.
Only supplied typed data enables a calculator or chart. Matching chart/table data
can share an evidence relationship, but adjacency alone never proves a relationship.
Source identities use validated canonical page URLs, preserving query parameters.
Inline claims retain their source numbers and links. Uncited supplied sources remain
available as references, without repeating an already visible source card.

## Layout grammar

Answers form one reading sequence. Introductions precede their original sections.
Heading hierarchy determines nested sections. Nothing essential is collapsed.
Body text uses Inter/system sans, 16px, weight 400, line height 1.65 and 70ch measure.
Titles use 26px, sections 21px, subsections 18px, metadata 13px. Spacing uses 8px
increments with 32px between sections and 16px between related units. No decorative
card around ordinary prose. Rich content can widen locally to 880px.

Layout responds to the actual answer container, including split panes. Small
textual comparisons become labeled rows on narrow containers. Numeric datasets
retain aligned table columns and scroll inside their own region. Source chips
remain beside claims. Logos come only from the approved exact-domain asset map.
Graphs retain supplied edges. Scenarios show assumptions and results together,
with accessible local controls and reset. Streaming never invents missing content.

## Implementation boundary

Replace the adjacency planner and canvas composition. Retain tested low-level
Markdown, math, chart, calculator, safe-link and existing protocol adapters.
Preserve legacy response components unchanged. No backend, model, research,
authority, account-role or infrastructure changes are needed. Rendering and local
controls must make zero model dispatches or reservations.

## Acceptance sequence

1. Test source-range fidelity, nested headings, reference context, malformed input,
   relationship accuracy, narrow layouts and streaming/reopen stability.
2. Exercise at least twelve different answer shapes through the real adapter.
   Label synthetic inputs and never claim retrieval or model generation occurred.
3. Verify available saved responses in the signed-in Workspace, full-size desktop,
   tablet and 390px mobile, light/dark, interactions and computed typography.
4. Review the complete answer against founder references, not a component count.
5. Run exact-source CI, verify candidate and rollback, then perform the authorized
   controlled release. PR remains draft and production unchanged until gates pass.
