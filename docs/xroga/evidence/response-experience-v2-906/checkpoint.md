# Response Experience V2, Issue 906

Status: IN_PROGRESS, NOT RELEASED. Founder instruction supersedes PRs 907/908.

Branch: codex/response-experience-v2-906. Baseline: 0d270ec69bdcf130ff85ce27f524e1d0d1e59e23, the preserved live frontend release. Earlier renderer edits remain on separate draft branches and are not included.

## Implemented

New module frontend/src/components/response-experience-v2 owns its own validated document, deterministic planner, scoped CSS tokens, composition, Markdown, lazy math/charts, paginated sortable tables, diagram layout, calculators, tabs, sources, notices, timelines and progress. No copied legacy JSX/CSS. React, ReactMarkdown, Recharts, KaTeX, icons and canonical data contracts are reused as low-level dependencies.

Only integration changes outside the module are Workspace server opt-in and one message-surface gate. The original renderer is the flag-off, unsupported-shape and error fallback. Existing task activity, cancellation, file access and approval controls remain in place. No persisted schema or message mutation, model call, backend change, paid resource or production promotion.

## Flag and security

Preview or development, or explicit server environment RESPONSE_EXPERIENCE_V2=founder, plus /workspace?responseV2=1. The request verifies Supabase getUser, current_community_role=owner, confirmed hello@xroga.com and AAL2 via the existing founder policy. Client profile must still match that server identity. Query alone and email-only checks cannot grant access. Production is off by default.

The founder review panel contains clearly labelled deterministic examples inside Workspace. It never saves a conversation or submits work. This is review support, not evidence that existing-history, artifact and task flows have passed live acceptance.

## Verification

- 15 focused tests PASS, latest job 61e13cc2-1443-432c-9385-a8deaed2844c.
- V2 frontend typecheck PASS, latest job 583e0138-7a41-4c01-97d9-7034f8564c3d.
- Payload size/depth, unsafe URLs, prototype keys, malformed output, duplicate IDs, graph edges, numeric chart values, local calculation limits and founder-policy negative cases tested.
- No legacy renderer internals or styles changed. Pinned remark-math 6.0.0 parses math rather than a custom parser. Currency and code remain intact. Existing dependency security patches PASS, job a5cdfcf6-8f66-418e-9879-b527df3cd0e3.
- Initial Preview build, deterministic golden, static contracts and mission CI passed at 20577c89. Unit/integrated/database workflows stopped on stale baseline source inventory/review bindings, before their acceptance tests. Reviewed binding repair and generated inventory are included in the follow-up, with no evaluator change.
- Founder reported sign-in completed. Workspace loads authenticated, but V2 is not visible yet. Added an opt-in-only denial reason to distinguish identity, role and assurance failures without weakening the gate. No live V2 acceptance claimed.

## Remaining acceptance work

Exact-source CI and production build. Founder-authenticated Preview visual and interaction matrix at 1440/1024/768/390, both themes, zoom, keyboard, reduced motion. Exercise actual saved/reopened history and stream reconnect. Test math/code/citation copy and links. Private artifact and consequential-action shapes remain original fallback until a new view can preserve their existing permission contracts. No synthetic success for those gates.

Full Issue 906 acceptance is PARTIAL. The UI is not activated or promoted to production. Existing production, microphone, Drive, Batch 1 and paused Batch 1.5/2 remain unchanged.
