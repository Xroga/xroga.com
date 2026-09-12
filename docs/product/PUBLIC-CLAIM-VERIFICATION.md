# Public claim verification

Current launch matrix, checked 2026-09-12. “Automated” means protected by tests and production code structure; “Live” means observed through the real production surface.

| Claim | Public URL | Implementation | Test/evidence | Status | Copy action |
| --- | --- | --- | --- | --- | --- |
| Normal AI conversation | `/features/ai-chat`, `/workspace` | Chat routing through the Xroga model stack | Automated suites plus E2E-CHAT-001 | VERIFIED | None |
| Current public-web search | `/features/ai-chat` | Parallel web intelligence | Automated suites plus E2E-WEB-002 official-only production run | VERIFIED | None |
| Deeper research | `/features/ai-chat` | Parallel research with explicit availability/failure | Page already labels deeper mode partial | PARTIAL | None |
| X/Twitter evidence | `/features/ai-chat` | Private xAI `x_search` path, X-only citation filter | Model-policy and X-only tests | AUTH REQUIRED | Keep “where configured” boundary |
| PDF/DOCX/text/Markdown/code understanding | `/features/ai-chat` | Attachment parsing and document routing | DOCX, attachment, and model-selection tests | VERIFIED (automated) | None |
| Screenshot/image understanding | `/features/ai-chat` | Vision-capable GLM route | Vision routing and modality tests | VERIFIED (automated) | None |
| General chat image generation | `/features/ai-chat`, `/features/ai-image-generation` | No active production caller | Capability registry and public copy explicitly say unavailable | UNSUPPORTED | Already disclosed; do not market as working |
| General-purpose browser automation | `/features/ai-chat` | Browser is a generated-web verification gate only | Capability registry and browser-gate tests | UNSUPPORTED | Already disclosed; do not market as chat browsing |
| New app generation | `/ai-app-builder` | Universal planner, adapters, validation, review, atomic publish | Universal fixture and execution suites | VERIFIED (automated); live breadth pending | Keep framework-dependent boundaries |
| Existing-repository focused edits | `/ai-coding-agent` | Authoritative repository hydration, incremental implementation, atomic writer | E2E-REPO-002 live one-file UI/GitHub agreement plus repository suites | VERIFIED | None |
| Real tests/builds | `/ai-app-builder`, `/ai-coding-agent` | Isolated validation runtime; captured exit codes | Runtime/validation test suites | VERIFIED (automated) | None |
| Browser-verified Preview | `/ai-app-builder`, `/workspace` | Browser gate after deterministic build | Browser gate/repair suites | AUTH REQUIRED | Keep conditional wording |
| GitHub branch/commit/push/PR | `/ai-coding-agent`, `/features/integrations` | GitHub OAuth plus atomic write and remote verification | Live disposable commit/PR and atomic-writer suite | VERIFIED | None |
| Vercel deployment | `/ai-app-builder`, `/features/integrations` | User-authorized or managed Vercel path with URL verification | Deployment adapter tests; no live test in this pass yet | AUTH REQUIRED | Keep conditional wording |
| Hundreds of runtime integrations | `/integrations` | Static technology catalog, not hundreds of active connectors | Source/runtime inventory and rendered production page | UNSUPPORTED | Corrected to “build catalog” |
| Code integration for catalog technologies | `/integrations` | Universal code generation/editing; live action still needs provider config | Universal fixtures and validation | PARTIAL | Explicitly distinguish code integration from connection |
| `1M+` end-to-end context | Homepage | One model spec has a 1M provider window, but runtime ceilings apply | Registry/context planner inspection and production HTML | PARTIAL | Corrected to `Focused Context` |
| Free plan | `/pricing` | 50 actions, one concurrent task, $1.65 internal ceiling | Plan tests and rendered production pricing | VERIFIED | None |
| Xroga Pro | `/pricing` | $25/month via Whop, 1,500 actions, two concurrent tasks, $20 internal ceiling | Plan tests, production pricing, and hosted Whop checkout contract | VERIFIED | None |
| Secrets stay server-side | `/security` | Credential allowlists, encrypted authorization storage, redaction | Secret-isolation and authorization suites | VERIFIED (automated) | None |
| No false “tested/pushed/live” result | `/security`, `/workspace` | Evidence gates and artifact contracts | Claim-guard, deployment, writer tests and E2E-REPO-002 | VERIFIED for tested/pushed; `Live` remains URL-gated | None |
