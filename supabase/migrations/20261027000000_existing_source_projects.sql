-- Batch 3 Phase 1: authorised existing-source bindings (an EXISTING repository linked to an Xroga project).
-- Additive only: no existing table or function is altered. Not applied anywhere; apply through the verified migration workflow
-- after review. Rollback: DROP TABLE public.existing_source_projects (nothing else references it).
--
-- A binding records WHICH repository, by the provider's immutable id, under WHICH connected account, at WHICH exact commit. Names and
-- URLs are display data: a rename updates `repository_full_name` and never redirects anything, and a transfer changes `owner_account_id`
-- which flips the binding to `transferred` until the owner links again. No token, secret or source content is stored here.
CREATE TABLE IF NOT EXISTS public.existing_source_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  origin_kind TEXT NOT NULL DEFAULT 'github' CHECK (origin_kind IN ('github')),
  provider_repository_id TEXT NOT NULL CHECK (provider_repository_id ~ '^[0-9]{1,20}$'),
  -- The connected GitHub account (user id) that authorised access at link time, and the repository owner's id.
  account_binding_id TEXT NOT NULL CHECK (account_binding_id ~ '^[0-9]{1,20}$'),
  account_login TEXT NOT NULL CHECK (length(account_login) BETWEEN 1 AND 100),
  installation_id TEXT CHECK (installation_id IS NULL OR installation_id ~ '^[0-9]{1,20}$'),
  owner_account_id TEXT NOT NULL CHECK (owner_account_id ~ '^[0-9]{1,20}$'),
  repository_full_name TEXT NOT NULL CHECK (length(repository_full_name) BETWEEN 3 AND 200),
  repository_private BOOLEAN NOT NULL,
  repository_archived BOOLEAN NOT NULL DEFAULT FALSE,
  base_branch TEXT NOT NULL CHECK (length(base_branch) BETWEEN 1 AND 200),
  base_commit_sha TEXT NOT NULL CHECK (base_commit_sha ~ '^[0-9a-f]{40}$'),
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(permissions) = 'object'),
  state TEXT NOT NULL DEFAULT 'linked' CHECK (state IN ('linked', 'access_lost', 'transferred', 'account_changed', 'unlinked')),
  state_reason TEXT NOT NULL DEFAULT '' CHECK (length(state_reason) <= 500),
  index_status TEXT NOT NULL DEFAULT 'not_indexed' CHECK (index_status IN ('not_indexed', 'indexing', 'valid', 'stale', 'partial', 'failed', 'unsupported')),
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One binding per owner and repository: linking the same repository again resolves to it.
  UNIQUE (owner_user_id, origin_kind, provider_repository_id)
);

CREATE INDEX IF NOT EXISTS idx_existing_source_projects_owner ON public.existing_source_projects (owner_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_existing_source_projects_project ON public.existing_source_projects (project_id) WHERE project_id IS NOT NULL;

ALTER TABLE public.existing_source_projects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.existing_source_projects FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.existing_source_projects TO service_role;

NOTIFY pgrst, 'reload schema';
