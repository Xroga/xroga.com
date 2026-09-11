# Launch test cost plan

The pass uses bounded prompts, one disposable repository, no customer repositories, no paid checkout, no real email delivery, no DNS change, and no app-store or blockchain publication.

| Test family | Maximum live attempts before investigation | External side effect | Cost control |
| --- | ---: | --- | --- |
| Direct chat | 2 | Conversation record | Short prompt; no repository hydration |
| Web search | 2 | Provider retrieval | One narrow current-fact question; require citations |
| Research | 2 | Provider research | Bounded comparison with explicit source count |
| Document/vision | 2 each | Uploaded disposable fixture | Small local fixtures; no unrelated context |
| Repository read | 2 | GitHub reads | Reuse the five-file disposable fixture |
| Repository write | 2 | Review branch/commit only | One-file change; no merge/deploy; stop after first verified semantic variant |
| New project | 1 per representative runtime family | Disposable branch/repository | Small acceptance criteria; no paid service provisioning |
| Deployment | 1 only if existing authorization and zero-cost path are confirmed | Disposable deployment | No domains, production aliases, or paid resources |

## Runtime cost evidence

- Production plans meter provider use through action, token-pool, and dollar ceilings.
- Per-run dollar cost was not exposed in the existing Workspace record, so no numeric live-run cost is claimed.
- Source audit found bounded retry, no-progress, deadline, tool-call, provider-reservation, and completion-reserve controls.
- The focused edit reused one hydrated repository snapshot for validation and publication. Its defect was presentation duplication, not a duplicate GitHub write.

## Stop conditions

Stop a live family after repeated identical failure, any unexpected charge, any authorization ambiguity, any attempt to touch a non-disposable resource, or enough evidence to isolate the underlying code path. Diagnose before retrying; never spend retries without new evidence.
