# Response presentation: open-source library decision (2026-11-05)

Scope: how Xroga's Workspace renders the answer and presentation specification that Zurelay DeepSeek produces. Constraint
that does not change: one model writes the answer and its presentation data, with no second formatting call; the frontend
renders allowlisted components deterministically and never runs model-written code.

## What Xroga already has (kept)

| Need | Existing, working piece |
| --- | --- |
| Presentation contract | Typed per-section data (`prose`, `cards`, `table`, `graph`, `steps`, `chart`, `calculator`), validated with zod in `backend/src/ai/responsePresentation.ts`, projected to `xroga-ui` blocks |
| Rendering | V2 renderer (`frontend/src/components/response-experience-v2`) |
| Diagrams | `@xyflow/react` 12.12 |
| Charts | `recharts` 3.x |
| Icons | `lucide-react` + brand marks; site logos from DeepSeek Search through `/api/site-icon` |
| Markdown, tables, math | `react-markdown` + `remark-gfm` + KaTeX |
| Persistence, share, copy | `responseSource` (`xroga-response-json-v1`) saved with the message |

## Libraries evaluated

| Library | License | Finding | Decision |
| --- | --- | --- | --- |
| `vercel-labs/json-render` (`@json-render/*` 0.22) | Apache-2.0 | Catalog of zod-typed components, flat JSON spec, `Renderer`, streaming spec compiler. This is the same idea Xroga already implements with its own contract. Adopting it would be a migration of the contract, validators, persisted `responseSource` and the renderer for no new capability. | Not adopted. Its technique (generate instructions from the catalog) informs prompt maintenance. Revisit only if streaming specs to the browser becomes a goal. |
| `vercel/streamdown` 2.7 | Apache-2.0 | A streaming-aware markdown renderer (unterminated blocks, Shiki, Mermaid, KaTeX, hardening). Workspace answers arrive complete, not token by token, so the streaming benefit is currently zero. It also needs Tailwind `@source` wiring and shadcn design tokens that Xroga does not use. | Not adopted. Revisit if token streaming reaches the browser. |
| `vercel/ai-elements` | repository notice says it is being deprecated at the end of November 2026 | Copy-in shadcn components that assume the Vercel AI SDK `useChat`. | Not adopted. |
| `a2ui-project/a2ui` | Apache-2.0 | Early public preview (v0.9.1, v1.0 candidate), still changing. | Not adopted. |
| `assistant-ui/assistant-ui`, `shadcn-ui/ui` | MIT | A whole chat application framework and a component kit. Xroga already has its own Workspace, thread, persistence and design tokens. | Not adopted. |
| `shiki` 4.6.0 | MIT | The one clear gap: code blocks had no syntax highlighting. | **Adopted**, pinned exactly. |

## What was adopted and how

Shiki, with its JavaScript regex engine (no WASM), loaded lazily on the first highlightable block, one language at a time.
`frontend/src/lib/codeHighlight.ts` turns code into colored tokens that React renders as text spans. No HTML string is ever
injected. Only an allowlist of languages is highlighted, oversized blocks stay plain, and any failure falls back to the plain
block that is always shown. The palette follows the theme in use, judged from the computed text color.

## What the real defects were

The measurable failures in live DeepSeek answers were not a missing renderer. They were: valid sections dropped by a validator
that required empty-text visuals to have text, planner bookkeeping marking good answers partial, calculators requesting
unsupported operation shapes, planner variance producing flat prose for numeric questions, and answers that did not carry
research results back. Those were fixed in the contract, prompt rules and deterministic coverage checks, not by a new framework.

## Reviewed by

Claude plugins used during development: `frontend-design`, `playwright`, `code-simplifier`, `security-guidance`, `feature-dev`.
The `webapp-testing` skill was inspected; Playwright against the real authenticated local Workspace is used instead.
