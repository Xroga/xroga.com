# Live generation contract correction, 2026-11-01

Baseline production frontend: 2547ca11524ae91cb874da85dc109132a969ed50, Vercel deployment 9qVigJYwiaa4hgT553mRcH1VeY1d. Backend continues serving xroga-api-b15b2-ac8168-serving-1031. No backend, SQL, routing, microphone or other-batch changes in this correction.

One new authenticated production SaaS explanation was submitted through the existing Workspace. Request logs show plan HTTP 200 at 09:24:05 UTC and chat HTTP 200 at 09:24:09 UTC. No manual generation retry. The owner's ledger in that request window records planner 2,568 input/254 output tokens at $0.000277 and answer 3,841 input/1,880 output at $0.000684, both deepseek_v4_flash. Total recorded cost is $0.000961. These are the existing planner/answer calls, not an extra formatting call. Local rendering tests make no model calls.

Observed defects:

- A transient chunk 8590 download failure replaced the answer with the error boundary. Resetting that boundary did not retry inference. Reload restored the persisted answer.
- The role table was removed from its authored position and appended below the takeaway. The architecture heading remained without a diagram. The saved message contains no graph and no original protocol response, so the exact rejected graph shape cannot be inferred retrospectively.
- Parser inspection reproduced silent rejection of malformed structured payloads, loss of original source, numeric-unit stripping, code-example table extraction and truncation after 250 table rows.

Correction preserves the original response as inert optional sourceText, carries validated blocks and narrative in source order through serialization and V2, reports rejected payloads as partial presentation, preserves units and long/code tables, and assigns stable unique block identifiers. Older persisted documents retain their existing path. Unsafe executable payloads and invented confirmations remain rejected. One bounded asset-load retry handles transient chunk errors without calling the API or submitting a prompt.

Local evidence: 1,360 frontend tests passed in job d4e770ab-edef-4025-aad0-7910cd04deae. Focused adapter/parser tests passed in ddff7e91-f40b-42c3-8f73-b955af18d726. Frontend TypeScript passed in 026b8c01-eff3-43a5-8e4c-5a5b77ff0772. Asset retry and rich-result safety tests passed in 387ac440-8f5d-44a8-9da3-c6b4ec5cec1f. Scoped ESLint passed in 01b4d08c-f486-4864-b2c0-00cb6c74a43a. Final exact-source CI remains required.

These are integration corrections, not live acceptance. Final-source CI, controlled Preview/release, new finance/research/code/simple answer checks, interactive persistence and desktop/mobile production proof remain pending. Existing SaaS generation must not be repeated solely to obtain prettier evidence. Preserve the current production deployment and legacy flag as rollback.
