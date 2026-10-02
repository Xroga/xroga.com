# Xroga UI/UX Step 1 Renderer Model

The canonical output contract is a versioned discriminated union validated at runtime with Zod. Blocks describe meaning, not a rendering library.

Foundation renderers cover narrative, notices, status, plans, activity, evidence, citations/sources, approvals, receipts, code, diffs, terminal output, files, engineering/website results, connection requests, errors, empty states, and generic artifacts.

The schema also reserves semantic types for metrics, tables, charts, timelines, graphs, maps, forms, choices, galleries, media, dashboards, documents, spreadsheets, presentations, boards, databases, and PDFs. UI/UX Step 1 intentionally uses a safe fallback for these future rich blocks rather than adding heavy dependencies.

`registerRenderer`, `getRenderer`, `canRender`, and `renderBlock` form the registry boundary. A renderer may be a normal or lazy React component. Unknown types render a bounded explanation and never crash a restored conversation.

Current `UniversalOutput`, `EngineeringArtifact`, and supported historical `featureOutput` values adapt into canonical blocks before rendering. Their persistence shapes remain unchanged.
