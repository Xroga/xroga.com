# Migration control

Migrations are generated through the Supabase CLI, reviewed in pull requests, dry-run by CI, and applied only from `main`. Command 3A adds server-only operational tables with RLS and no browser grants. Application code treats an unapplied migration as a 503 blocker, never as empty successful data.
