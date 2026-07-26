# Command 3A architecture decisions

- Extend the existing deployment, queue, health, and Supabase systems; do not create a second orchestrator.
- Store operational releases, evidence, incidents, webhook deliveries, and audit records server-side with RLS enabled and no browser grants.
- Treat provider `READY` as provider state, not product verification. Readiness requires evidence and remains blocked/unknown when evidence is absent.
- Separate `/health` liveness from `/ready` dependency readiness. Protect detailed metrics with authenticated administrator access.
- Promotion and rollback are policy evaluators only in this command. They cannot call a provider without a later explicit, authorized execution step.
- Never store secret values in configuration status, evidence, metrics labels, or API errors.
