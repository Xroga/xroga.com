# Production audit — 2026-07-26

| Area | Evidence | Classification |
|---|---|---|
| Vercel production | Deployment `dpl_23dvMmY6H7X1YTA9iH9zihMnoNUa` is READY for commit `8d96593…`; `xroga.com` returned 200 | partially_working: deployment exists, end-to-end product verification incomplete |
| Vercel runtime | 24-hour query returned no grouped runtime errors; observed statuses included 200 and 307 | verified for queried window only |
| Fly API | `/health` and `/api/health` returned 200 | partially_working: liveness only |
| API readiness | `/ready` returned 404 before this branch | missing; implemented here, not yet deployed |
| Metrics | `/metrics` returned 200 publicly before this branch | broken exposure; protected here, not yet deployed |
| DNS | `xroga.com` returned 200; `www.xroga.com` did not resolve | blocked_external |
| GitHub deploy | Fly and frontend checks succeeded for `8d96593…` | verified workflow evidence |
| Database | migration workflow last applied migrations at older commit `99941d7…` | drift unknown; new migration pending merge |
| Backup/restore | no safe provider restore evidence accessible | external_only |

No production mutation, migration, deployment, promotion, rollback, or destructive recovery test was performed during this audit.
