# Production security

Operational tables use RLS, service-role-only grants, and authenticated administrator APIs. Metrics are no longer public. Webhooks fail closed and store payload digests, not bodies. Fly setup is pinned to an immutable action commit and fixed CLI version. Detailed credentials, provider errors, and private configuration values are excluded.
