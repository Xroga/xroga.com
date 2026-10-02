# Xroga UI/UX Step 2 — Universal outputs and artifacts

This is the second UI/UX layer. It does not replace Xroga's project, execution, event, verification, or delivery systems.

## Canonical path

Structured result → runtime-validated `XrogaBlock` → renderer registry → lazy rich renderer → optional bounded artifact context → existing composer and backend route.

Presentation is selected from structured result shape and MIME/type metadata. Prompt keywords never choose execution or presentation. Unknown output remains an explicit saved-output fallback.

## Native output support

- metrics and metric groups;
- searchable, sortable, paged, selectable tables; spreadsheets and database views;
- line, area, and bar charts with accessible summaries;
- dashboards composed from the same metric/chart/table contracts;
- timelines, node/edge graphs, location lists, forms, choices, boards, galleries, media, Markdown documents, presentations, and PDF artifacts;
- loading, empty, partial, error, and unsupported states.

Tables use TanStack Table. Dataset virtualization is enabled after 100 rows through TanStack Virtual. Charts use Recharts. All three libraries are isolated behind a lazy renderer so simple conversation does not load them.

## Artifact continuity

An output may include stable artifact identity, project/conversation/run provenance, version, and timestamps. The existing persisted conversation owns artifact content. A small persisted UI context stores only the active artifact identity and bounded selection descriptors. It never duplicates the artifact, project workspace, or runtime state.

Selected rows, chart points, and graph nodes may be attached to the next message as identifiers and a short label. Raw records are not silently copied into the prompt. Users can remove context chips before sending.

## Safety and honest limitations

- URLs pass the existing safe artifact URL boundary; Markdown ignores raw HTML.
- The A2UI adapter is a data-only allowlist. Scripts, HTML, arbitrary actions, and unknown components are rejected.
- Forms and choices are read-only until a real authorized continuation handler exists.
- Maps render validated locations and link to OpenStreetMap; no provider or interactive map capability is claimed.
- Graphs use an accessible native node/edge view. React Flow and Mermaid were not added because no current backend contract emits positioned graphs or trusted diagram source.
- Monaco, xterm, Sandpack, and Univer were not added. Existing code/terminal/workspace surfaces already own those concerns, and adding parallel editors/runtimes would violate the architecture.
- MCP Apps are not advertised because no current MCP Apps host contract is connected to this output path.
- Version metadata is displayed only when it exists. Restore/revert/share actions are not fabricated.
