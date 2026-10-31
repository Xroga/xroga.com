# Response Experience V2, Issue 906

Status: IN_PROGRESS, NOT RELEASED. Founder instruction supersedes PRs 907/908.

Branch: codex/response-experience-v2-906. Baseline: 0d270ec69bdcf130ff85ce27f524e1d0d1e59e23, the preserved live frontend release. Earlier renderer edits remain on separate draft branches and are not included.

## Implemented

New module frontend/src/components/response-experience-v2 owns its own validated document, deterministic planner, scoped CSS tokens, composition, Markdown, lazy math/charts, paginated sortable tables, diagram layout, calculators, tabs, sources, notices, timelines and progress. No copied legacy JSX/CSS. React, ReactMarkdown, Recharts, KaTeX, icons and canonical data contracts are reused as low-level dependencies.

Only integration changes outside the module are Workspace server opt-in and one message-surface gate. The original renderer is the flag-off, unsupported-shape and error fallback. Existing task activity, cancellation, file access and approval controls remain in place. No persisted schema or message mutation, model call, backend change, paid resource or production promotion.

## Flag and security

Preview or development, or explicit server environment RESPONSE_EXPERIENCE_V2=founder, plus /workspace?responseV2=1. The request verifies Supabase getUser, confirmed hello@xroga.com, server-owned owner role and AAL2. Client profile must match that server identity. Query or client email alone cannot grant access. Production is off by default. This flag grants presentation only, never admin, data, credential or action access. The canonical owner/AAL2 operations policy remains unchanged.

The former founder fixture panel has been removed from Workspace. Deterministic examples now run only through a loopback-bound local development harness using the actual V2 renderer. They never save a conversation or submit work.

## Verification

- 15 focused tests PASS, latest job 61e13cc2-1443-432c-9385-a8deaed2844c.
- V2 frontend typecheck PASS, latest job 583e0138-7a41-4c01-97d9-7034f8564c3d.
- Payload size/depth, unsafe URLs, prototype keys, malformed output, duplicate IDs, graph edges, numeric chart values, local calculation limits and founder-policy negative cases tested.
- No legacy renderer internals or styles changed. Pinned remark-math 6.0.0 parses math rather than a custom parser. Currency and code remain intact. Existing dependency security patches PASS, job a5cdfcf6-8f66-418e-9879-b527df3cd0e3.
- Initial Preview build, deterministic golden, static contracts and mission CI passed at 20577c89. Unit/integrated/database workflows stopped on stale baseline source inventory/review bindings, before their acceptance tests. Reviewed binding repair and generated inventory are included in the follow-up, with no evaluator change.
- Founder sign-in and saved-history reopening verified. Read-only diagnosis found the confirmed founder account has member role and no enrolled MFA. Commit 6c479b82 incorrectly relaxed the Preview gate to identity alone. This was contrary to AGENTS.md and has been corrected by restoring the original owner/AAL2 gate. No account permissions or production configuration changed. Screenshots and calculator/chart interactions recorded on 6c479b82 are renderer observations only, not authorized final acceptance.
- Blocking live Preview prerequisite: founder account must satisfy the existing owner-role and AAL2 policy. No automatic privilege grant or MFA bypass is permitted.
- Conflicting chat text in stream/completion payloads could be silently ignored. A focused negative test reproduced this before correction. Such payloads now preserve the canonical fallback rather than guessing which text to discard. The 16-test suite passed before the subsequent presentation-gate correction, which is being verified separately.

## Remaining acceptance work

Exact-source CI and production build. Founder-authenticated Preview visual and interaction matrix at 1440/1024/768/390, both themes, zoom, keyboard, reduced motion. Exercise actual saved/reopened history and stream reconnect. Test math/code/citation copy and links. Private artifact and consequential-action shapes remain original fallback until a new view can preserve their existing permission contracts. No synthetic success for those gates.

Full Issue 906 acceptance is PARTIAL. The UI is not activated or promoted to production. Existing production, microphone, Drive, Batch 1 and paused Batch 1.5/2 remain unchanged.

## Access-policy restoration verification

- Restored founder role/AAL2 gate: focused V2 and canonical founder tests PASS, job 36a3a637-380c-49ab-8d95-05259386325f.
- Tenant/egress source integrity, inventory, requirements validation and frontend typecheck PASS, job 02dc9c9d-62cd-420e-9f6f-d2ff6094f96f.
- Observed on superseded 6c479b82 Preview: persisted conversation rendered, supplied chart values A=10/B=15/C=12, calculator 500 to 1000 and reset to 500, local tab interaction. These do not establish final authenticated acceptance because that commit omitted the required owner/AAL2 gate.
- Final visual/responsive/streaming acceptance remains BLOCKED pending valid founder Preview access. Production unchanged.

## Founder rejection redesign, 2026-11-01

Status: PARTIAL, not accepted, no merge or promotion. PR #909 comment 6549094950 and updated Issue #906 govern this revision.

- New scoped typography and spacing, 72ch prose, broader data surfaces, responsive controls and numeric alignment.
- Deterministic composition groups exact matching adjacent chart/table data and adjacent calculator/details without changing source order or model wording.
- Generated labels such as `Data table 1` originate in the existing canonical parser, `frontend/src/lib/xrogaResponseDocument.ts`. V2 suppresses those mechanical display titles without editing that parser or losing source data. Meaningful supplied captions remain.
- Financial example combines inputs, result, a locally calculated percentage sensitivity curve, reset and details in one surface. Curve values are derived from the explicit formula and bounds, never invented market data.
- Removed the synthetic review panel from the customer message path. Its replacement is a local development harness bound to 127.0.0.1, outside Next routes and without authentication mocks.

Verification of this working-tree revision:
- 22/22 focused adapter, composition, math and canonical founder-policy tests passed. Job 36d2f695-0aba-4441-862d-9675ad5ee144.
- Frontend TypeScript passed. Job 8abd319c-6a6e-4766-9f94-674e794186c7.
- Focused ESLint passed. Job 016da737-1244-4f72-838b-6c4789e7a33f.
- Actual V2 DOM marker confirmed in the local harness. Full-size 1440 desktop before/after captures cover greeting, cited explanation, supplied chart and financial scenario. 1024 light explanation and 390 mobile light/dark controls captured.
- Calculator changed 500 to 1000 on risk 1 to 2, Reset restored 500, and assumptions tab displayed its supplied content. Chart source disclosure retained A=10, B=15, C=12.
- At 390px, greeting, explanation, chart, calculator, multilingual, code, math and diagram had no document horizontal overflow. This does not prove every possible payload fits.
- Streamed explanation completed with citations and source panel preserved. JSON serialization/reopening preserved the fixture. This is not live database persistence or reconnect evidence.

Screenshots retained locally in outputs/response-experience-v2-906/redesign under the main workspace. Before/after images use the same fixtures and actual V2 component, not a static mockup. The harness does not reproduce every Workspace stylesheet or authentication behavior.

Remaining: valid founder owner/AAL2 session for real Workspace visual, saved-history and stream-reconnect acceptance, full zoom/long-conversation matrix, final founder visual approval and exact-source CI. No founder gate bypass, account permission change, model spending, production traffic change, legacy renderer edit or Batch 1.5/2 activation occurred.

Source/register maintenance passed after reviewing the only new conservative persistence candidate: native Array.from creates 21 in-memory sensitivity points. It has a source-bound NOT_PERSISTENCE disposition, not an authorization exemption. Job 8d13504b-997d-44a3-92a7-398c1b78fa1b. Strict egress audit: 150 total, 150 reviewed, 0 pending, 0 unexplained high-risk bypasses. Tenant audit integrity passed and retains its pre-existing broader criterion blockers, not blanket tenant acceptance.

Code-copy interaction returned exactly the supplied TypeScript function. The synthetic review server and its disposable bundle are shut down after evidence capture. No paid resources were created.
