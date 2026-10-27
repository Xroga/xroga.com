-- Batch 3 Phase 2: derived code maps for linked existing repositories.
-- Additive only; depends on 20261027000000_existing_source_projects.sql. Not applied anywhere. Rollback: DROP TABLE public.existing_source_indexes.
--
-- A code map is DERIVED private-code metadata (paths, symbols, signatures, import lists, blob SHAs). It is never authoritative (GitHub at
-- the linked commit is), is keyed by the exact commit, is deleted with its binding (ON DELETE CASCADE) and by the application when a
-- binding is unlinked or loses its connection, and is readable only by the API with the service role and an owner predicate.
CREATE TABLE IF NOT EXISTS public.existing_source_indexes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  binding_id UUID NOT NULL REFERENCES public.existing_source_projects(id) ON DELETE CASCADE,
  commit_sha TEXT NOT NULL CHECK (commit_sha ~ '^[0-9a-f]{40}$'),
  schema_version TEXT NOT NULL CHECK (length(schema_version) BETWEEN 1 AND 40),
  parser_version TEXT NOT NULL CHECK (length(parser_version) BETWEEN 1 AND 80),
  status TEXT NOT NULL CHECK (status IN ('valid', 'partial', 'failed', 'unsupported')),
  file_count INTEGER NOT NULL CHECK (file_count >= 0),
  content_fingerprint TEXT NOT NULL CHECK (content_fingerprint ~ '^[0-9a-f]{64}$'),
  size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 0 AND 8388608),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  built_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (binding_id, commit_sha)
);

CREATE INDEX IF NOT EXISTS idx_existing_source_indexes_owner_binding ON public.existing_source_indexes (owner_user_id, binding_id, built_at DESC);

ALTER TABLE public.existing_source_indexes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.existing_source_indexes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.existing_source_indexes TO service_role;

NOTIFY pgrst, 'reload schema';
