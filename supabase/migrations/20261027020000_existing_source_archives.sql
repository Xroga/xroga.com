-- Batch 3: ZIP import of an EXISTING project. Additive; service role only (RLS on, no policies, no public grants).
-- The archive's text is derived from an upload the owner made; it is removed with the binding it is linked to.

ALTER TABLE public.existing_source_projects DROP CONSTRAINT IF EXISTS existing_source_projects_origin_kind_check;
ALTER TABLE public.existing_source_projects ADD CONSTRAINT existing_source_projects_origin_kind_check CHECK (origin_kind IN ('github', 'archive'));

-- An imported ZIP has no GitHub account: the importing user's id stands in for the account and owner ids (a UUID, not a GitHub numeric id).
-- The numeric rule stays in force for every GitHub binding; only an archive binding may carry the user's UUID in those two columns.
ALTER TABLE public.existing_source_projects DROP CONSTRAINT IF EXISTS existing_source_projects_account_binding_id_check;
ALTER TABLE public.existing_source_projects ADD CONSTRAINT existing_source_projects_account_binding_id_check
  CHECK (account_binding_id ~ '^[0-9]{1,20}$' OR (origin_kind = 'archive' AND account_binding_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'));
ALTER TABLE public.existing_source_projects DROP CONSTRAINT IF EXISTS existing_source_projects_owner_account_id_check;
ALTER TABLE public.existing_source_projects ADD CONSTRAINT existing_source_projects_owner_account_id_check
  CHECK (owner_account_id ~ '^[0-9]{1,20}$' OR (origin_kind = 'archive' AND owner_account_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'));

CREATE TABLE IF NOT EXISTS public.existing_source_archives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  archive_number BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  owner_user_id UUID NOT NULL,
  binding_id UUID REFERENCES public.existing_source_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  digest TEXT NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  file_count INTEGER NOT NULL CHECK (file_count BETWEEN 1 AND 5000),
  kept_bytes INTEGER NOT NULL CHECK (kept_bytes BETWEEN 0 AND 8388608),
  files JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, digest)
);

CREATE INDEX IF NOT EXISTS existing_source_archives_binding_idx ON public.existing_source_archives (binding_id);

ALTER TABLE public.existing_source_archives ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.existing_source_archives FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.existing_source_archives TO service_role;
