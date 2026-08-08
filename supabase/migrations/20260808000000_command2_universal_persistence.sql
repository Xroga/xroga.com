-- Command 2 universal agent persistence.
--
-- Extends rather than duplicates. Checked against the live schema rather than assumed:
-- execution_runs, model_routing_outcomes, project_memory, swarm_run_traces and swarm_runs
-- already exist and nothing here recreates them. (Command 1 keeps its task graph inside
-- execution_runs.state rather than in a separate table, so there is no execution_tasks to
-- extend.) None of the ten table names below currently exists.
--
-- What was missing is everything the universal path produces: specs, architecture plans,
-- the derived repository index, capability profiles, benchmark results, research evidence
-- and the replanning log.
--
-- Ownership model
-- ---------------
-- Every row carries user_id and project_id. RLS grants each user read access to their own
-- rows and nothing else, and writes go through service_role — the backend is the only
-- writer, so a compromised client token cannot forge a spec or a benchmark result.
--
-- repository_index_files is service-only for both read and write. It holds derived content
-- from private repositories at file granularity, and there is no product reason for a
-- browser to page through it.
--
-- Secrets
-- -------
-- No table here stores a credential. Provider keys stay in the existing encrypted-secret
-- system; research_evidence stores a URL with its query string already stripped by the
-- application layer, and model_capability_profiles stores no keys at all.
--
-- Rollback
-- --------
-- Every statement is IF NOT EXISTS, so re-running is safe. To roll back, drop the tables in
-- the reverse of the order below (children before parents); no existing table is altered
-- destructively, so a rollback cannot damage Command 1 data.

-- ─────────────────────────────────────────────────────────────────────────────
-- Universal runs
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.universal_runs (
  run_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  schema_version TEXT NOT NULL DEFAULT '1.0.0',
  -- Which path served this request, so shadow and enabled runs stay distinguishable.
  routing_mode TEXT NOT NULL CHECK (routing_mode IN ('off', 'shadow', 'enabled')),
  status TEXT NOT NULL CHECK (status IN (
    'planning', 'ready', 'ready_with_blockers', 'refused_no_surface',
    'blocked_no_adapter', 'executing', 'completed', 'failed', 'cancelled'
  )),
  repository_owner TEXT,
  repository_name TEXT,
  branch TEXT,
  source_commit_sha TEXT,
  result_commit_sha TEXT,
  blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_universal_runs_user_updated
  ON public.universal_runs(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_universal_runs_project
  ON public.universal_runs(project_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Product specs and architecture plans
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_specs (
  spec_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  run_id TEXT,
  schema_version TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  -- Open by design: a surface this version has never seen must survive a round trip, so
  -- surfaces are JSONB rather than an enum column.
  surfaces JSONB NOT NULL DEFAULT '[]'::jsonb,
  spec JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_specs_project
  ON public.project_specs(project_id, updated_at DESC);
-- Follow-up prompts load the most recent spec for a project; §51 depends on this lookup.
CREATE INDEX IF NOT EXISTS idx_project_specs_user_project
  ON public.project_specs(user_id, project_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.architecture_plans (
  plan_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  spec_id TEXT REFERENCES public.project_specs(spec_id) ON DELETE SET NULL,
  run_id TEXT,
  schema_version TEXT NOT NULL,
  inherited_from_repository BOOLEAN NOT NULL DEFAULT FALSE,
  components JSONB NOT NULL DEFAULT '[]'::jsonb,
  decisions JSONB NOT NULL DEFAULT '[]'::jsonb,
  blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_architecture_plans_project
  ON public.architecture_plans(project_id, updated_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Repository index
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.repository_indexes (
  index_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  repository_id TEXT NOT NULL,
  repository_owner TEXT NOT NULL,
  repository_name TEXT NOT NULL,
  branch TEXT NOT NULL,
  -- The correctness of every read rests on this column. A row whose commit is not current
  -- HEAD must never be served, which the application enforces before querying.
  indexed_commit_sha TEXT NOT NULL,
  tree_sha TEXT,
  schema_version TEXT NOT NULL,
  file_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One index per project, repository and branch. Two projects pointing at the same
  -- repository keep separate rows so neither can read the other's.
  UNIQUE (project_id, repository_id, branch)
);

CREATE INDEX IF NOT EXISTS idx_repository_indexes_lookup
  ON public.repository_indexes(project_id, repository_id, branch);

CREATE TABLE IF NOT EXISTS public.repository_index_files (
  id BIGSERIAL PRIMARY KEY,
  index_id TEXT NOT NULL REFERENCES public.repository_indexes(index_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  blob_sha TEXT NOT NULL,
  language TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  is_binary BOOLEAN NOT NULL DEFAULT FALSE,
  component_root TEXT,
  component_adapter_id TEXT,
  workspace_root TEXT,
  symbols JSONB NOT NULL DEFAULT '[]'::jsonb,
  imports JSONB NOT NULL DEFAULT '[]'::jsonb,
  exports JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT,
  embedding_ref TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (index_id, file_path)
);

CREATE INDEX IF NOT EXISTS idx_repository_index_files_index
  ON public.repository_index_files(index_id, file_path);
CREATE INDEX IF NOT EXISTS idx_repository_index_files_component
  ON public.repository_index_files(index_id, component_root);
-- Retrieval by blob SHA is how rename detection and change comparison work.
CREATE INDEX IF NOT EXISTS idx_repository_index_files_blob
  ON public.repository_index_files(index_id, blob_sha);

-- ─────────────────────────────────────────────────────────────────────────────
-- Model capability and benchmarks
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.model_capability_profiles (
  profile_id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  model_version TEXT,
  schema_version TEXT NOT NULL,
  context_window INTEGER NOT NULL DEFAULT 0,
  maximum_output INTEGER NOT NULL DEFAULT 0,
  tool_support BOOLEAN NOT NULL DEFAULT FALSE,
  structured_output_support BOOLEAN NOT NULL DEFAULT FALSE,
  vision_support BOOLEAN NOT NULL DEFAULT FALSE,
  streaming_support BOOLEAN NOT NULL DEFAULT FALSE,
  capability_scores JSONB NOT NULL DEFAULT '[]'::jsonb,
  language_scores JSONB NOT NULL DEFAULT '[]'::jsonb,
  latency_ms_p50 INTEGER,
  success_rate NUMERIC(4, 3),
  input_usd_per_1m NUMERIC(10, 4) NOT NULL DEFAULT 0,
  output_usd_per_1m NUMERIC(10, 4) NOT NULL DEFAULT 0,
  last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- NOT NULL deliberately. A profile with no expiry would be trusted forever, which is the
  -- exact failure the expiry mechanism exists to prevent.
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (model_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_model_capability_profiles_expiry
  ON public.model_capability_profiles(expires_at);

CREATE TABLE IF NOT EXISTS public.model_benchmark_runs (
  id BIGSERIAL PRIMARY KEY,
  benchmark_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  succeeded BOOLEAN NOT NULL,
  build_passed BOOLEAN,
  tests_passed BOOLEAN,
  patch_applied BOOLEAN,
  regression_count INTEGER NOT NULL DEFAULT 0,
  security_findings INTEGER NOT NULL DEFAULT 0,
  repair_attempts INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_model_benchmark_runs_model
  ON public.model_benchmark_runs(model_id, ran_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Research provenance
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.research_runs (
  research_run_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  run_id TEXT,
  provider TEXT NOT NULL,
  query_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.research_evidence (
  evidence_id TEXT PRIMARY KEY,
  research_run_id TEXT NOT NULL REFERENCES public.research_runs(research_run_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  schema_version TEXT NOT NULL,
  provider TEXT NOT NULL,
  -- Stored with the query string already stripped by the application, since a query string
  -- can carry an API key.
  source_url TEXT NOT NULL,
  source_title TEXT,
  publisher TEXT,
  official_domain BOOLEAN NOT NULL DEFAULT FALSE,
  query TEXT NOT NULL,
  fact TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  trust_tier TEXT NOT NULL CHECK (trust_tier IN ('A', 'B', 'C', 'D')),
  freshness_class TEXT NOT NULL,
  verification_status TEXT NOT NULL CHECK (
    verification_status IN ('unverified', 'corroborated', 'contradicted', 'expired', 'revalidated')
  ),
  conflict_group TEXT NOT NULL,
  implementation_decision_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_research_evidence_run
  ON public.research_evidence(research_run_id);
-- Conflicting claims are found by group; expired ones by expiry.
CREATE INDEX IF NOT EXISTS idx_research_evidence_conflict
  ON public.research_evidence(conflict_group, trust_tier);
CREATE INDEX IF NOT EXISTS idx_research_evidence_expiry
  ON public.research_evidence(expires_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- Dynamic replanning
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.plan_mutations (
  id BIGSERIAL PRIMARY KEY,
  -- The idempotency guarantee for restart recovery: replaying a log cannot add the same
  -- migration task twice because the key collides.
  mutation_key TEXT NOT NULL UNIQUE,
  run_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  kind TEXT NOT NULL,
  triggered_by_task_id TEXT,
  reason TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Replay reads a run's mutations in the order they were applied.
CREATE INDEX IF NOT EXISTS idx_plan_mutations_run
  ON public.plan_mutations(run_id, id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row level security
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.universal_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.architecture_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repository_indexes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repository_index_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_capability_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_benchmark_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_mutations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Read-own policies. There is deliberately no INSERT or UPDATE policy for authenticated
  -- users on any of these: the backend is the only writer, so a compromised client token
  -- cannot forge a spec, a benchmark result or a piece of research evidence.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'universal_runs' AND policyname = 'Users read own universal runs') THEN
    CREATE POLICY "Users read own universal runs" ON public.universal_runs FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'project_specs' AND policyname = 'Users read own project specs') THEN
    CREATE POLICY "Users read own project specs" ON public.project_specs FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'architecture_plans' AND policyname = 'Users read own architecture plans') THEN
    CREATE POLICY "Users read own architecture plans" ON public.architecture_plans FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'repository_indexes' AND policyname = 'Users read own repository indexes') THEN
    CREATE POLICY "Users read own repository indexes" ON public.repository_indexes FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'research_runs' AND policyname = 'Users read own research runs') THEN
    CREATE POLICY "Users read own research runs" ON public.research_runs FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'research_evidence' AND policyname = 'Users read own research evidence') THEN
    CREATE POLICY "Users read own research evidence" ON public.research_evidence FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'plan_mutations' AND policyname = 'Users read own plan mutations') THEN
    CREATE POLICY "Users read own plan mutations" ON public.plan_mutations FOR SELECT USING (auth.uid() = user_id);
  END IF;

  -- model_capability_profiles and model_benchmark_runs carry no user data and are not
  -- per-user: they describe models. RLS is enabled with no permissive policy, so they are
  -- service-only rather than world-readable — routing evidence is operational detail, and
  -- publishing which model scores worst on which language is not something to do by
  -- accident.

  -- repository_index_files has RLS enabled and no policy either. It holds derived content
  -- from private repositories at file granularity, and there is no product reason for a
  -- browser to page through it.
END $$;

GRANT ALL ON TABLE public.universal_runs TO service_role;
GRANT ALL ON TABLE public.project_specs TO service_role;
GRANT ALL ON TABLE public.architecture_plans TO service_role;
GRANT ALL ON TABLE public.repository_indexes TO service_role;
GRANT ALL ON TABLE public.repository_index_files TO service_role;
GRANT ALL ON TABLE public.model_capability_profiles TO service_role;
GRANT ALL ON TABLE public.model_benchmark_runs TO service_role;
GRANT ALL ON TABLE public.research_runs TO service_role;
GRANT ALL ON TABLE public.research_evidence TO service_role;
GRANT ALL ON TABLE public.plan_mutations TO service_role;

GRANT SELECT ON TABLE public.universal_runs TO authenticated;
GRANT SELECT ON TABLE public.project_specs TO authenticated;
GRANT SELECT ON TABLE public.architecture_plans TO authenticated;
GRANT SELECT ON TABLE public.repository_indexes TO authenticated;
GRANT SELECT ON TABLE public.research_runs TO authenticated;
GRANT SELECT ON TABLE public.research_evidence TO authenticated;
GRANT SELECT ON TABLE public.plan_mutations TO authenticated;

GRANT USAGE, SELECT ON SEQUENCE public.repository_index_files_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.model_benchmark_runs_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.plan_mutations_id_seq TO service_role;
