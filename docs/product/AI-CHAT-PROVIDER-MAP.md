# Xroga AI Chat provider map

Current as of 2026-09-10. Environment-variable names are documentation only; values must never appear in the browser, repository, prompts, logs, or this report.

| Capability | Provider / runtime | Why | Required configuration | Cost / usage | Fallback | Production status |
|---|---|---|---|---|---|---|
| General chat | DeepSeek V4 Flash through OpenRouter | efficient normal conversation | `OPENROUTER_API_KEY` | plan-metered tokens | configured four-model policy | WORKING |
| Current public web | Parallel Search / Extract / Responses | source-preserving public retrieval | `PARALLEL_API_KEY` | web budget ledger | none; failure remains visible | WORKING |
| Research synthesis | GLM-5.3 Flash | efficient final evidence synthesis | `GLM_API_KEY` | plan-metered tokens | four-model policy where allowed | WORKING |
| X-only research | xAI Responses API, Grok 4.3 + X Search | compliant X-native retrieval with post citations | `XAI_API_KEY` | provider-metered; 500 max output tokens | none | WORKING when configured |
| Documents | local PDF/DOCX/text extractors + Xroga model stack | avoids uploading unread raw files as a single opaque context | model provider keys | plan-metered tokens | model policy | WORKING for supported formats |
| Vision / screenshots | GLM-5.3 Flash multimodal path | current supported vision model in the production stack | `GLM_API_KEY` | plan-metered tokens | none outside current model policy | WORKING |
| Repository implementation | Xroga build pipeline + GitHub services | keeps code work and verification separate from ordinary chat | user GitHub authorization + model keys | plan/provider limits | explicit blocker | WORKING when authorised |
| Browser verification | Playwright inside isolated sandbox | observes generated web projects without running them on the API host | sandbox configuration and `XROGA_SANDBOX_BROWSER_IMAGE` | infrastructure usage | explicit `not_checked` | PARTIAL; build verification only |
| Image generation | none | legacy media route is retired | none | none | none | NOT IMPLEMENTED |

Official API references: [Parallel API](https://docs.parallel.ai/), [xAI Responses API](https://docs.x.ai/docs/guides/responses-api), [xAI X Search](https://docs.x.ai/docs/guides/tools/search-tools), [GitHub Apps](https://docs.github.com/en/apps), and [Playwright](https://playwright.dev/docs/intro).
