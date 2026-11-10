# Workspace inline citations and visible answer content

Base: `23072785b435bd2162512ca7683d7311631e47b9`.

- Native OpenUI Source blocks and matched numeric references use a shared source chip with the publisher label or domain, an icon, and the article title on hover or keyboard focus. The chip directly opens the source. Escape dismisses the preview. Unavailable icons use the existing globe fallback. Google-owned help and ads domains use the existing local Google mark.
- Workspace and native Share show all distinct safe source destinations in a compact list. Older answers use the same source presentation. The list does not change source numbering, stored evidence, Copy or the Share snapshot.
- Native charts show their exact data table and diagrams show all relationships directly. Older answer layouts show reference lists, underlying scores, evidence and result details without expanding a disclosure. Existing chart and diagram controls remain available.
- Ordinary answer tables fit up to four columns to the available width and keep rows in one continuous view. Spreadsheet and database controls and large-table virtualization remain available. Answer table export controls follow the data.
- Reviewed the supplied screenshots and sampled the 192-second recording across its duration. The reference uses compact chips beside claims and places tables and diagrams in the answer flow.

The Chrome fixture used the same native renderer at five viewport widths (320, 390, 768, 1280 and 1440 CSS pixels) in light and dark themes. It checked pointer and keyboard previews, Escape, mobile tap navigation with the destination intercepted, duplicate and unsafe destinations, all six source links, visible chart data and diagram relationships, and existing calculator and diagram interactions. Test icon responses are controlled fixtures except for the local Google mark. The authenticated Workspace and Share suite now asserts that the source lists are visible, but the authenticated suite needs a matching hosted candidate to run against this source.

The four targeted unit suites passed all 56 tests. The Chrome fixture passed 15 scenarios per viewport and theme combination. Axe found no violations on the calculator and diagram fixture pages. The strict egress audit retained all 159 existing reviewed callers with none pending.

The local Next.js production build passed. The built `/workspace` passed the desktop and 390px browser regression with intercepted guest chat transport: both table columns fit, row 26 was present without pagination, the source link pointed to the expected page, and its keyboard preview closed with Escape. The fixture sent no provider requests. Local free space ended about 1.51 GiB lower after building and testing. The local build and preserved screenshots were kept for review.

No production traffic or data changed, and no provider calls were made. Existing authentication, roles, source provenance, and billing paths are unchanged. The icon uses the existing same-origin public favicon route where applicable. The current tenant and egress inventories were refreshed. The single rebound manual record is the unchanged `Uint8Array.from` conversion in `decodeBase64UrlUtf8`, verified byte for byte in its enclosing function. No security acceptance was inherited from that rebind.

Release status: local candidate. Run the exact-source frontend gates and authenticate against the matched staging deployment before promoting. The presentation can be rolled back by restoring the previous compatible frontend, with no database change or saved-answer migration.
