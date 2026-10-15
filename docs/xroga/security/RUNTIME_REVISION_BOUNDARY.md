# Runtime revision identity boundary — Command 007

The existing service-role revision readers filtered `user_id` and logical `project_id`, but trusted the embedded `software_project` and its Outcome Contract. A corrupted/misbound snapshot could therefore supply different project/run identities to restore, fork and runtime consumers. This is a confirmed missing validation boundary, not evidence of an externally exploited endpoint.

The canonical store now restores only when row owner/project, snapshot project/run, and contract project/run agree. `loadLatestRevision`, history listing and exact revision loading share this guard. Invalid latest snapshots return no revision; invalid history snapshots throw the existing safe `TenantAccessError` before restore/fork writes. No replacement identifiers, ownership grants, schema changes, new store or runtime execution are introduced.

The real disposable integration case exercises positive owner reads, foreign-owner denial, four snapshot/contract mismatches, and verifies that denied restore/fork operations create neither revisions nor events. Focused unit tests also reject malformed rows/contracts and verify cloned valid results. CI evidence must be tied to the new source SHA; earlier 43-case runs cannot certify this additional case.

Limits: this is identity validation, not full SoftwareProject schema certification. Logical runtime project IDs are TEXT and are not automatically equivalent to `projects.id`. Revision/event/secret writers still need complete authenticated-caller and logical-project provenance review; event/session associations, repository authorization, providerState validation, secret lifecycle/key management and redaction remain separate unresolved requirements. Merely seeing user filters does not certify those callers. Production diagnostics, machines, credentials and migrations were not accessed.

Rollback: revert the bounded reader/helper change only on the feature branch if compatibility fails; preserve evidence of invalid snapshots and do not repair ownership by overwriting stored identifiers. No production rollout is authorized.
