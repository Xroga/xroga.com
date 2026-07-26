# Command 3B operational audit

| Subsystem | Before Command 3B | Command 3B result | Evidence |
|---|---|---|---|
| Product/tenant boundary | verified complete | reused | `projects.user_id`, `operations_memberships`, `OperationsService.access` |
| Releases/deployments/readiness | verified complete | reused and exposed tenant-safely | Command 3A tables, `/ready`, product API |
| Portfolio/resource state | missing | implemented | `operations_environments`, `operations_resources`, `/api/operations/portfolio` |
| Permissions | admin-only route, incomplete | implemented | server role matrix plus project membership checks |
| Safe actions | evaluator/in-memory only | implemented | durable actions, approvals, runs, RPC lease/lock, evidence and audit |
| Provider operations | partial | canonical contract implemented; unsupported capabilities remain unavailable | HTTP verification and internal database adapters |
| Incidents/alerts | partially working | durable listing and guarded incident transitions | product API and internal adapter |
| Jobs/webhooks | partially working | tenant-scoped state and bounded replay | extended Command 3A tables and conditional updates |
| Configuration posture | missing | implemented without values | `operations_config_checks`, mismatch/staleness evaluator |
| SLO/capacity | partial Command 3A evaluator | exposed truthfully | `operations_slo_snapshots`, capacity resources |
| Maintenance/freeze | missing | implemented and enforced | maintenance table, action precondition, schedule/cancel actions |
| Automation | missing | implemented | rule/run tables, deduplication, rate limits, stop and safe-action routing |
| Frontend | admin readiness only | real Operations Centre | `/dashboard/operations` |
| Completion status | manual | derived | `deriveCommand3BStatus` rejects missing evidence |

No duplicate router, project registry, release system, deployment system, queue or webhook store was introduced. Command 3A systems were extended in place.

Provider-specific production mutation adapters for Fly, Vercel, DNS, Supabase restore and external queues are not claimed as working. Their actions remain blocked as `unsupported` or `external_setup_required` until a configured adapter exists. This is an intentional truthful boundary, not a simulated capability.
