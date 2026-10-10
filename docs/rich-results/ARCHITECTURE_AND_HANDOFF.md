# Xroga rich answer cards — Command 1.5

## Existing architecture and integration

The canonical `XrogaBlock` discriminated union remains the sole output contract. `rich-results` is a version-1 member, not a second chat runtime. `xrogaResponseDocument` accepts a data-only `xroga-ui` fence during an ordinary AI turn, validates it through the existing A2UI/Zod boundary, keeps prose outside the fence, and hands the canonical document to `TerminalChatContext` for message rendering and persistence. `FeatureOutputView` and `XrogaOutputView` render the new lazy card renderer in both current and historical messages. Existing SSE transport, Markdown, tables, charts, code, artifacts, previews and approval paths are unchanged.

When web search returns only title, URL, snippet and source, `xrogaWebResultAdapter` conservatively emits `search-result` cards in the actual message log. It never infers domain, price, availability or image rights. Inline citations and the existing source panel remain. A richer model-authored `rich-results` fence can show supplied structured entities, while the model prompt explicitly requires source identity and forbids invented transaction details. The parser rejects model-authored `confirmed` cards; only a future separately authenticated server adapter may emit one.

## Contract and presentation

`frontend/src/lib/xrogaRichResults.ts` defines source, money basis, media rights, route legs/local time zones, facts, coupon, availability evidence, limitations and status. Non-demo items require a source; checked availability requires evidence; confirmed requires evidence and a receipt reference. URL handling rejects non-web source schemes and credentials. The UI only renders source links after a second URL check. Image URLs are intentionally fail-closed: original local demo WebP images are accepted only when the card is explicitly demo-labelled, while no external image host is enabled without a provider-rights review. Existing `next.config.mjs` image patterns are not widened. Missing or broken images use a gradient and domain icon. No HTML or executable actions enter this contract.

Statuses are search result, offer, availability checked, confirmed (trusted server adapter only), unavailable, expired and demo. The card prints the price basis (one way, per night, total stay, etc.) and does not silently compare mixed-currency prices. Typed transport mode chooses flight/train/bus/ferry/transfer icons; route legs retain distinct departure and arrival local time zones, with full zone IDs in expanded details. Missing values are displayed as unknown/not supplied, never made up. Source observation time is shown only when provided.

The renderer has list/grid layout, horizontal mode, ticket-like route details, image browsing, category filter, title/price sorting where valid, multi-selection comparison, coupon copy, expandable details and source links. Its visual language uses quiet surfaces, gentle shadows, structured metadata and low-motion fallbacks. All controls are native buttons, inputs, links, selects or details elements with visible focus styles.

## Domain coverage and deliberate limits

The gallery has 33 illustrative items spanning transport (flights, multi-leg, train, bus, ferry, transfer), accommodation, shopping/coupons, reservations, vehicles, travel, business and other structured answers. They all carry `demo` status; sample amounts and names are not live offers. The four original generated photos are clearly labelled illustrative, not property/product/provider evidence. The 13 supplied reference images were inspected for layout inspiration only and were not published.

No live booking, purchase, restaurant slot, coupon validity, flight fare or provider-photo rights feed is connected. These require an authorized backend integration that supplies source/observed time, offer and availability evidence, rights/attribution, tenant-safe links and authenticated transaction receipts. Until then, normal web metadata becomes source-only cards and unsupported provider imagery falls back safely.

## Future adapter contract and Command 2 compatibility

Future providers should map into `XrogaRichResult` server-side, preserve provenance and time zones, and validate against the same schema before returning canonical blocks. Privileged `confirmed` status should be bound to a server-side authenticated receipt, not to model prose or a client flag. A rights-reviewed host can be added to `safeRichImageUrl` and `next.config.mjs` together. The contract is domain-neutral and can be embedded in the future Command 2 workbench without changing chat transport or project history.

## Image provenance

Original illustrative assets were generated with the built-in image generator and mechanically optimized to WebP: `coastal-suite.webp`, `alpine-lake.webp`, `airplane-window.webp`, `headphones.webp`. Prompt themes were: an unbranded sunlit coastal room; an alpine lake with mountains; a passenger view of an aircraft wing over clouds; and unbranded premium headphones on a neutral studio surface. They contain no claimed real business, product or inventory identity. All four are under `frontend/public/os-preview/rich-results/` and used only in the noindex, explicitly labelled gallery.
