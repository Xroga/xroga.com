# Native Workspace answer reliability

The hosted window on source `72402bbefe4278eb0e719738cb466052bc6555e0` proved native rendering, Copy, and exact persistence for a real DeepSeek answer. It stopped after that answer contained contradictory tenant permissions and inaccurate Stripe ordering guidance. The hosted Reopen check had reloaded Workspace without selecting the saved conversation.

## Changes

- Check both Markdown and OpenUI literals for the observed RLS and Stripe contradictions. When the Markdown contains one of the new failure patterns, place the documented correction above the original draft and withhold the unsafe native presentation.
- Recover readable Markdown from a valid native-only response. Preserve headings, code, static tables and chart data in the existing text contract. Invalid programs still use available text.
- Make the full text available in the rich answer and its share view. Plain responses and failures during lazy loading use the existing Markdown renderer directly.
- The controlled authenticated browser case checks a detail that exists only in the full text, verifies that Copy includes it, then explicitly reopens the saved conversation and checks it again. The separate hosted harness now follows the same saved-title and session-ID flow.

No provider, persistence schema, tenant policy, network destination, or dispatch allowance changed. The existing prompt asks the same DeepSeek call to check role and state consistency and cover the user's requested deliverables.

## Release gate

Verify the exact candidate through authenticated CI, then use a separately approved private window for fresh architecture, revenue, attachment-backed calculator and mixed-layout prompts. Require ordinary-account Reopen, private Share, tenant denials and decoder recovery. Retain the current decoder-compatible rollback before any production promotion. The already-closed hosted window supplies a replay fixture and cannot be reused for new inference.

[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security#bypassing-row-level-security) · [PostgreSQL policies](https://www.postgresql.org/docs/current/sql-createpolicy.html) · [Stripe event ordering](https://docs.stripe.com/webhooks#event-ordering)

## Workspace schema recovery

The hosted response at `58d4eeab88cba91a4b6d62abb14773e9c36b430a` kept its Markdown, but schema rejection withheld the entire rich layout. Its redacted trace included plain objects in a list. The pinned parser accepts some of those objects even though the list renderer expects strings or `ListItem` components. The raw program was unavailable, so the trace cannot establish that the list was the only invalid block.

New Workspace answers normalize known list fields and revalidate the full program. Static tables with rows that do not match the header are rejected before rendering. If schema errors remain, bounded recovery keeps valid content in its original order within layout containers, including references and local calculator state. An omitted component produces an explicit partial answer. Copy, Share, and saved history use the same readable answer and validated program. Recovery requires the original program to pass the authority and factual checks. A candidate must also pass evidence, resource, and data checks.

Regression tests replay the observed list shape and cover invalid nested content, tables, charts, diagrams, code, calculators, evidence, and native-only replies. These tests use captured shapes and local inputs. A fresh hosted DeepSeek run, account isolation in hosted staging, and a decoder-compatible rollback are separate release checks. No additional provider request is used for repair.

### Browser verification

The authenticated browser test exercises a partially recovered response through the normal Workspace composer, then checks the native table, Copy, database persistence and Reopen. It substitutes only the paid transport. The isolated application and database handle authentication and storage.

Repeated DNS failures on both Ubuntu mirrors blocked Chromium setup before browser assertions could run. The browser and baseline jobs install the pinned Playwright Chromium and verify that it can launch and render a page. They install the Playwright system dependencies only if that launch check fails, then require it to pass. The application, fixture and security checks remain mandatory.

[Playwright installation and system dependencies](https://playwright.dev/docs/browsers)

### Factual review recovery

The private test of `d1238ff9a` withheld the entire native architecture program at factual review. Its diagnostic did not distinguish the ordering rule from the retry-window rule, and the rejected text was intentionally unavailable.

When only the layout triggers a known factual rule, the Workspace now withholds the flagged content, reports the relevant correction, and keeps independent components that pass the same validation. This stays a partial answer. Recovery is limited to stopped completions and cannot override authorization, evidence ownership, or chart data review. Diagnostics record the fixed rule identifier without logging generated claims. The authenticated fixture covers the corrected text, rich table, Copy and Reopen.
