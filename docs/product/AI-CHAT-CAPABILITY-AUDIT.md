# Xroga AI Chat capability audit

Reviewed against production callers on 2026-09-10. A registry declaration or abandoned file is not counted as a working product path.

| Capability | Status | Active production path | Provider / tool | Security boundary | Missing / page decision |
|---|---|---|---|---|---|
| General AI chat | WORKING | `POST /api/phase1/chat` → `runChatPipeline` | Xroga four-model stack | Auth, quota, server-side keys | Shown |
| Conversation context | WORKING | recent history passed by the terminal and bounded server-side | Xroga model stack | limited history size; authenticated task | Shown as conversation behavior |
| Automatic tool routing | PARTIAL | `decideWebAction`, attachment routing, frontend build handoff | DeepSeek classifier + typed routes | classifier failures fail closed | Shown with scope |
| Current web search | WORKING | `runWebIntelligence` → `parallelSearch` | Parallel | server key, redaction, timeout, normalized sources | Shown |
| Source retrieval | WORKING | Parallel extract/search/responses | Parallel | retrieved text marked untrusted | Shown |
| Research | WORKING | semantic decision → Parallel Responses low effort → GLM synthesis | Parallel + GLM-5.3 Flash | citations retained; uncited external synthesis rejected | Shown |
| Deep research | PARTIAL | semantic decision → Parallel Responses medium effort | Parallel + GLM-5.3 Flash | same web boundary | Not described as a fully autonomous multi-hop researcher |
| X/Twitter search | WORKING when configured | xAI Responses API with `tools: [{type: "x_search"}]` | private Grok 4.3 retrieval | XAI key server-only; X-domain citations only; 500 output-token limit | Shown conditionally and accurately |
| Document upload / analysis | WORKING | terminal upload → `prepareAttachments` → document model route | local PDF/DOCX/text extraction + DeepSeek/GLM | SSRF/private-host checks, size and context bounds | Shown for supported formats |
| Image upload / vision / screenshot analysis | WORKING | terminal upload → vision content → GLM-5.3 Flash | GLM vision route | supported MIME/size checks; server model call | Shown |
| Screenshot → repository fix | PARTIAL | attachment plus project-update intent can enter build pipeline | vision + repository build workflow | connected project and normal write permissions required | Described as contextual, never guaranteed |
| Browser navigation / automation | PARTIAL | build verification adapter only | Playwright in isolated sandbox when configured | no generated code on API host; bounded runtime | Marketed only as browser-assisted build verification |
| Website/mobile testing and screenshots | PARTIAL | production build verification gate | Playwright sandbox | viewport evidence; explicit `not_checked` states | Mentioned only in Coding Agent context |
| Image/logo/product visual generation | ABANDONED | legacy `/media` route returns retired response | none active | old provider declarations are not executable | Not marketed on AI Chat page |
| Repository understanding and coding handoff | WORKING | build requests leave Phase 1 and use workspace build pipeline | repository tools + Xroga model stack | canonical repo/branch/root assertion and GitHub authorization | Shown as handoff to separate product |
| GitHub workflow | WORKING with user authorization | GitHub integration and atomic write services | GitHub App/OAuth | token vault, branch safety, concurrency/atomic write | Linked to Coding Agent |
| API / integration discovery | PARTIAL | current web research plus repository implementation flow | Parallel + coding pipeline | official docs preferred; credentials through integrations | Shown as assisted workflow |
| Multi-agent orchestration | WORKING for builds | router, architect, builder, reviewer, QA, security, deploy phases | Xroga execution pipeline | task-specific capabilities and validation | Not branded as an autonomous “Swarm OS” in Chat |
| Citations / sources | WORKING for web/X paths | `webSources` returned by Phase 1 and rendered by workspace | Parallel/xAI | normalized safe URLs; uncited evidence rejected | Shown |

## Explicit non-claims

- General-purpose browser control is not a current Xroga AI Chat tool.
- The retired media route is not a working image generator.
- A screenshot can be analysed without a repository; implementing a fix requires an authorised project context.
- A provider being configured does not prove that a particular request completed.
