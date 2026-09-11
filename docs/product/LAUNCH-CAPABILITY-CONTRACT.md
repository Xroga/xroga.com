# Product Hunt launch capability contract

Verified against the production release endpoints, the public product pages, the runtime capability registry, and an authenticated disposable-repository run on 2026-09-11. This contract separates an executable capability from a technology catalog entry. A catalog entry means Xroga can generate or edit code that uses that technology; it does not mean Xroga owns an authenticated runtime connector for it.

## Production identity

- Frontend: `ae73ccf3665323309e1ae457d22d81aeafce7d46` from `https://xroga.com/api/release`.
- Backend: `6b3e548ef590108175fe121cf646ccb6bf7748a4` from `https://xroga-api.fly.dev/health` and `/ready`.
- The releases are source-compatible: no backend path changed between the backend release commit and the frontend release commit.

## Capability truth table

| User outcome | Production path | Required authority/configuration | Evidence required before success | Launch status |
| --- | --- | --- | --- | --- |
| Direct chat, explanation, and grounded writing | Xroga model stack | Signed-in user and plan quota | Non-empty provider response; no fabricated external action | Working |
| Public-web search and research | Parallel web intelligence | Server-side Parallel configuration | Current source URLs or an explicit unavailable result | Working |
| X/Twitter-specific research | xAI `x_search` | Server-side xAI configuration | X-only citations; uncited evidence rejected | Working for X-native requests only |
| Repository inspection and focused code edits | Repository runtime plus universal execution | Authorized GitHub repository and canonical repo/branch/root | Remote context, deterministic validation, exact remote commit SHA | Working |
| New software project generation | Universal planner, implementation adapters, validation runtime | Supported local validation runtime; GitHub authorization to publish | Generated files, real command exit codes, review evidence, commit SHA when published | Working, with framework-dependent validation |
| Existing-project tests and builds | Isolated validation runtime | Discoverable project commands and supported toolchain | Captured command, exit code, and bounded output | Working where the project runtime is supported |
| Browser verification of generated web projects | Build-pipeline browser gate | Configured isolated browser runtime and a startable web project | Inspected page state/trace or an explicit not-checked blocker | Conditional build gate; not a general chat browser |
| PDF, DOCX, text, Markdown, code, and image understanding | Attachment/file processing plus vision routing | Supported file type and size; model availability | Successful parse/model response or explicit parse failure | Working for advertised formats |
| General image creation/editing from chat | No active production caller | A future production image route | Provider asset identifier and readable persisted asset | Unavailable; must not be marketed as working |
| GitHub branch, commit, push, and pull-request handoff | Authorized GitHub operations and atomic writer | User GitHub authorization and repository permission | Remote branch/commit/PR identifier | Working; consequential writes remain scoped and serialized |
| Vercel project/deployment operations | Authorized Vercel operations | User Vercel authorization and buildable project | Provider deployment identifier plus reachable URL before “Live” | Conditional on authorization and project compatibility |
| Database, authentication, payment, email, blockchain, and external API code | Universal software implementation | User-supplied product requirements; provider configuration for live calls | Build/test evidence; authenticated provider result for any claimed live external action | Code integration is working; live external action is provider- and authorization-dependent |
| Integration catalog | Static technology catalog | None to browse | Catalog count and labels only | Catalog, not hundreds of pre-authorized runtime connectors |

## Model and context claims

- Xroga routes work through its private four-model policy rather than exposing a vendor picker.
- One configured model specification has a one-million-token provider context window. The runtime still applies safe-request limits, focused repository selection, plan budget limits, attachment limits, and provider availability. Public wording must not imply that every user request sends or accepts one million tokens end to end.
- “Multimodal” is supported for the advertised attachment/vision path. It does not imply a general image-generation tool.
- “Long-horizon” means bounded multi-step planning, implementation, verification, repair, review, and handoff. It does not mean an unbounded autonomous process.

## Plan and cost boundaries

- Free: 50 AI actions per 30 days, one concurrent task, and a $1.65 internal provider-cost ceiling.
- Xroga Pro: $25/month through Whop, 1,500 AI actions per 30 days, two concurrent tasks, and a $20 internal attributable-cost ceiling.
- User-visible action counts are not a promise that every action has the same provider cost or context size.
- Launch tests must use bounded prompts and disposable repositories. They must not incur real payment, email, DNS, app-store, or customer-repository consequences.

## Truth rules for every surface

1. “Changed” means a content difference between the hydrated starting snapshot and the final committed snapshot, not every file present in the repository.
2. “Tested”, “built”, and “verified” require captured deterministic evidence. A model statement is not evidence.
3. “Pushed” and “committed” require the observed remote SHA. “Live” additionally requires a reachable deployment URL.
4. Provider/catalog availability must not be presented as an authenticated connection.
5. Missing permission, provider configuration, runtime, or evidence must render as a clear blocker instead of a success claim.
6. The visible repository, branch, and project root must equal the write target or the write is refused.

## Known launch defect under repair

An authenticated disposable-repository run produced the correct one-file GitHub commit `ab260dc78cd46a343798e3e7f447cb58a055b931`, but its completion artifact reported all five files in the merged project snapshot as changed. Repository safety and scope were correct; the user-facing diff summary was not. The launch fix must preserve the full snapshot for validation and atomic publication while deriving completion artifacts from the actual before/after file trail.
