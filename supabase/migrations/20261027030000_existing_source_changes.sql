-- Batch 3: durable record of a change to an EXISTING project (request, scope, revisions with test evidence, events, deliveries).
-- Additive; service role only (RLS on, no policies, no public grants). Deleted with its binding.

CREATE TABLE IF NOT EXISTS public.existing_source_changes (
  id UUID PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  binding_id UUID NOT NULL REFERENCES public.existing_source_projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('queued','planning','working','verifying','repairing','verified','unverified','failed','cancelled','interrupted','delivered')),
  base_commit_sha TEXT NOT NULL CHECK (base_commit_sha ~ '^[0-9a-f]{40}$'),
  instruction TEXT NOT NULL CHECK (char_length(instruction) BETWEEN 3 AND 8000),
  payload JSONB NOT NULL,
  payload_bytes INTEGER NOT NULL CHECK (payload_bytes BETWEEN 0 AND 12582912),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS existing_source_changes_owner_binding_idx ON public.existing_source_changes (owner_user_id, binding_id, created_at DESC);

ALTER TABLE public.existing_source_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.existing_source_changes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.existing_source_changes TO service_role;
