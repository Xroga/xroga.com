# Xroga AI Chat implementation report

Implementation date: 2026-09-10

## Product boundary

`/features/ai-chat` is now a dedicated, self-canonical product page. It describes supported conversation, current public-web retrieval, cited research, supported document analysis, screenshot/vision understanding, X-only research, and the handoff into the separate repository-aware AI Coding Agent.

It does not market the retired media route as image generation or the isolated Playwright verification gate as general-purpose browser automation. The page links to the Coding Agent rather than blending the two products.

## Runtime and safety changes

- Capability status is derived from active production callers, not provider-key presence alone.
- Retired image generation and general browser automation report `unavailable` in the capability registry.
- Research requests fail closed when retrieval fails or returns no evidence. The user receives a retryable, controlled message and Xroga does not synthesize an uncited current answer.
- Ordinary chat remains independent of the research-failure guard.
- Grok remains private X-only retrieval with `x_search`, X-domain citation filtering, uncited-evidence rejection, and a 500-output-token cap.
- Provider keys remain server-side. Retrieved text remains explicitly untrusted.

## Provider mapping

The detailed current-state map is in [AI-CHAT-PROVIDER-MAP.md](./AI-CHAT-PROVIDER-MAP.md), and the caller-by-caller product audit is in [AI-CHAT-CAPABILITY-AUDIT.md](./AI-CHAT-CAPABILITY-AUDIT.md).

## Verification

| Check | Result |
|---|---|
| Backend tests | 2,311 tests; 2,298 passed, 13 skipped, 0 failed |
| Backend TypeScript build | passed |
| Frontend tests | 620 passed, 0 failed |
| Frontend production build | passed |
| Lint | passed with pre-existing warnings only |
| SEO route audit | 21 public routes, 6 private routes, 5 discovery files passed |
| Browser visual/runtime check | 8 representative routes at desktop and mobile widths passed |
| Diff whitespace check | passed |

The browser run asserts HTTP 200, exactly one H1, no horizontal overflow, and no page/console errors. Screenshots are generated under `artifacts/seo-phase2/` and are verification artifacts rather than public product claims.

## Production

Deployment SHA and canonical verification are recorded after the release in [SEO-PHASE2-IMPLEMENTATION-REPORT.md](../seo/SEO-PHASE2-IMPLEMENTATION-REPORT.md).
