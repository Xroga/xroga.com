# Command 3A architecture decisions

- Extend the existing deployment, queue, health, and Supabase systems; do not create a second orchestrator.
- Store operational releases, evidence, incidents, webhook deliveries, and audit records server-side with RLS enabled and no browser grants.
- Treat provider `READY` as provider state, not product verification. Readiness requires evidence and remains blocked/unknown when evidence is absent.
- Separate `/health` liveness from `/ready` dependency readiness. Protect detailed metrics with authenticated administrator access.
- Promotion and rollback are policy evaluators only in this command. They cannot call a provider without a later explicit, authorized execution step.
- Never store secret values in configuration status, evidence, metrics labels, or API errors.

## Command 3B additions

- Reuse `projects` as the tenant/product boundary and Command 3A release, deployment, incident, evidence, webhook, queue and audit state. Do not create a second product registry.
- Store cross-product operational observations in `operations_resources`; every observation carries source, observed/verified/stale timestamps and reconciliation state. Missing observations remain unknown or unavailable.
- Keep all privileged tables server-only. Browser roles have grants revoked; authenticated API calls resolve project ownership or an `operations_memberships` role and enforce each permission again server-side.
- Run mutations through one durable action record. Idempotency keys, action-plan digests, target versions, advisory locks, leases, attempt budgets, confirmation, independent approval, post-action verification, evidence and immutable audit history are canonical.
- Provider adapters declare supported capabilities. An absent adapter returns `unsupported`; absent configuration returns `external_setup_required`; provider failure never becomes success.
- Automation rules are disabled by default, deduplicate trigger digests, respect maintenance, rate limits and emergency stop, and route all work back through the same safe-action service.
- The Operations Centre reads typed backend APIs only. It contains no production fixtures and renders absent data as unknown, unavailable, not configured or insufficient data.
