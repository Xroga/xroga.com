# Rollback runbook

1. Stop certification and identify the last release whose frontend `/api/release`, backend `/ready`, database compatibility, and production browser evidence all passed.
2. If a frontend regression is isolated, promote the last verified Vercel deployment.
3. If an API regression is isolated, redeploy the last verified Fly image/revision and verify `/health`, `/api/health`, and `/ready`.
4. Do not reverse an applied Supabase migration unless its checked-in migration includes a tested reversible path. Prefer a forward repair that preserves data.
5. Run the production browser verification against the recovered release and record its exact commit.
6. Keep the failed release out of service; do not mark rollback complete from provider status alone.
