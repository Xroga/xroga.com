-- Batch 2 Phase 1: durable AI Product Builder projects and source revisions.
-- Additive only. No existing table is altered. Apply through the verified
-- migration workflow after review; nothing here runs automatically.
-- Rollback: DROP FUNCTION public.append_builder_revision(...), then DROP TABLE
-- public.builder_revisions, public.builder_projects (no other table references them).

CREATE TABLE IF NOT EXISTS public.builder_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Client-supplied idempotency identity. A retried create resolves to the same row.
  request_key TEXT NOT NULL CHECK (length(request_key) BETWEEN 8 AND 128),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  product_type TEXT NOT NULL CHECK (length(product_type) BETWEEN 1 AND 80),
  state TEXT NOT NULL DEFAULT 'created' CHECK (state IN (
    'created','specified','generating','generated','verifying','verified',
    'partial','blocked','failed','cancelled'
  )),
  state_reason TEXT NOT NULL DEFAULT '',
  spec JSONB NOT NULL,
  starter JSONB NOT NULL,
  conversation_id TEXT,
  active_run_id TEXT,
  current_revision_id UUID,
  current_revision_number INTEGER NOT NULL DEFAULT 0 CHECK (current_revision_number >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, request_key)
);

CREATE INDEX IF NOT EXISTS idx_builder_projects_owner
  ON public.builder_projects(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.builder_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.builder_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL CHECK (revision_number >= 1),
  parent_revision_id UUID REFERENCES public.builder_revisions(id),
  run_id TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('starter','generation','repair','followup','restore')),
  content_sha256 TEXT NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  file_count INTEGER NOT NULL CHECK (file_count >= 0),
  total_bytes BIGINT NOT NULL CHECK (total_bytes >= 0),
  -- Authoritative durable snapshot: complete files, never a diff. Bounded in the service.
  files JSONB NOT NULL,
  change_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN (
    'unverified','verified','partial','failed'
  )),
  verification JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, revision_number),
  -- A retry of the same run that produced the same content is the same revision.
  UNIQUE (project_id, run_id, content_sha256)
);

CREATE INDEX IF NOT EXISTS idx_builder_revisions_project
  ON public.builder_revisions(project_id, revision_number DESC);
CREATE INDEX IF NOT EXISTS idx_builder_revisions_owner
  ON public.builder_revisions(user_id, created_at DESC);

ALTER TABLE public.builder_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.builder_revisions ENABLE ROW LEVEL SECURITY;

-- Owner-scoped read only. Writes go through the server and the function below.
DROP POLICY IF EXISTS builder_projects_owner_select ON public.builder_projects;
CREATE POLICY builder_projects_owner_select ON public.builder_projects
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS builder_revisions_owner_select ON public.builder_revisions;
CREATE POLICY builder_revisions_owner_select ON public.builder_revisions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.builder_projects, public.builder_revisions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.builder_projects, public.builder_revisions TO authenticated;
GRANT ALL ON TABLE public.builder_projects, public.builder_revisions TO service_role;

-- Atomic, idempotent revision append. The row lock on the project serialises concurrent
-- writers so revision numbers are gapless and a retried (run, content) pair returns the
-- existing revision instead of inserting a duplicate.
CREATE OR REPLACE FUNCTION public.append_builder_revision(
  p_project_id UUID, p_user_id UUID, p_run_id TEXT, p_origin TEXT,
  p_content_sha256 TEXT, p_file_count INTEGER, p_total_bytes BIGINT,
  p_files JSONB, p_change_summary JSONB, p_expected_parent UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE proj public.builder_projects%ROWTYPE;
  existing public.builder_revisions%ROWTYPE;
  created public.builder_revisions%ROWTYPE;
BEGIN
  IF p_project_id IS NULL OR p_user_id IS NULL OR COALESCE(length(p_run_id),0)=0
    OR p_content_sha256 IS NULL OR p_content_sha256 !~ '^[a-f0-9]{64}$'
    OR jsonb_typeof(p_files) IS DISTINCT FROM 'array' THEN RETURN NULL; END IF;
  SELECT * INTO proj FROM public.builder_projects
    WHERE id=p_project_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO existing FROM public.builder_revisions
    WHERE project_id=p_project_id AND run_id=p_run_id AND content_sha256=p_content_sha256;
  IF FOUND THEN
    RETURN jsonb_build_object('revision_id',existing.id,'revision_number',existing.revision_number,'replayed',true);
  END IF;
  -- Stale writer: the caller built on a parent that is no longer the head.
  IF p_expected_parent IS DISTINCT FROM proj.current_revision_id THEN
    RETURN jsonb_build_object('conflict',true,'current_revision_id',proj.current_revision_id);
  END IF;
  INSERT INTO public.builder_revisions(project_id,user_id,revision_number,parent_revision_id,run_id,origin,
      content_sha256,file_count,total_bytes,files,change_summary)
    VALUES(p_project_id,p_user_id,proj.current_revision_number+1,proj.current_revision_id,p_run_id,p_origin,
      p_content_sha256,p_file_count,p_total_bytes,p_files,COALESCE(p_change_summary,'{}'::jsonb))
    RETURNING * INTO created;
  UPDATE public.builder_projects SET current_revision_id=created.id,
      current_revision_number=created.revision_number, updated_at=now()
    WHERE id=p_project_id;
  RETURN jsonb_build_object('revision_id',created.id,'revision_number',created.revision_number,'replayed',false);
END;
$$;
REVOKE ALL ON FUNCTION public.append_builder_revision(UUID,UUID,TEXT,TEXT,TEXT,INTEGER,BIGINT,JSONB,JSONB,UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.append_builder_revision(UUID,UUID,TEXT,TEXT,TEXT,INTEGER,BIGINT,JSONB,JSONB,UUID) TO service_role;
NOTIFY pgrst,'reload schema';
