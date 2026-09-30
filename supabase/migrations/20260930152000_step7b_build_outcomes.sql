-- Step 7B.1
-- Sanitized BuildOutcome memory.
--
-- This is evaluation/routing memory, NOT model-training data.
--
-- Privacy boundary:
-- - no prompts
-- - no messages
-- - no generated source
-- - no repository contents
-- - no secrets
--
-- One row per run_id makes recording idempotent.
-- A resumed run can replace an earlier interrupted/failed state with its
-- later authoritative terminal outcome.

CREATE TABLE IF NOT EXISTS public.build_outcomes (
  run_id TEXT PRIMARY KEY,

  user_id UUID NOT NULL
    REFERENCES auth.users(id)
    ON DELETE CASCADE,

  schema_version TEXT NOT NULL
    DEFAULT '1.0.0',

  reuse_scope TEXT NOT NULL
    DEFAULT 'evaluation_and_routing'
    CHECK (
      reuse_scope IN (
        'evaluation_and_routing'
      )
    ),

  terminal_status TEXT NOT NULL
    CHECK (
      terminal_status IN (
        'complete',
        'error',
        'cancelled'
      )
    ),

  success BOOLEAN NOT NULL,

  feature_category TEXT,

  failure_category TEXT NOT NULL
    CHECK (
      failure_category IN (
        'none',
        'user_cancelled',
        'interrupted',
        'capacity',
        'provider',
        'verification',
        'compile',
        'test',
        'preview',
        'publication',
        'deployment',
        'policy',
        'platform',
        'unknown'
      )
    ),

  failure_code TEXT,

  iteration_count INTEGER NOT NULL
    DEFAULT 0
    CHECK (
      iteration_count >= 0
    ),

  duration_ms BIGINT
    CHECK (
      duration_ms IS NULL
      OR duration_ms >= 0
    ),

  model_telemetry JSONB NOT NULL
    DEFAULT '[]'::jsonb,

  recorded_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS
  idx_build_outcomes_user_updated
ON public.build_outcomes(
  user_id,
  updated_at DESC
);

CREATE INDEX IF NOT EXISTS
  idx_build_outcomes_failure
ON public.build_outcomes(
  failure_category,
  updated_at DESC
);

CREATE INDEX IF NOT EXISTS
  idx_build_outcomes_success
ON public.build_outcomes(
  success,
  updated_at DESC
);

ALTER TABLE
  public.build_outcomes
ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'build_outcomes'
      AND policyname = 'Users read own build outcomes'
  ) THEN
    CREATE POLICY
      "Users read own build outcomes"
    ON public.build_outcomes
    FOR SELECT
    USING (
      auth.uid() = user_id
    );
  END IF;
END
$$;

GRANT ALL
ON TABLE public.build_outcomes
TO service_role;

GRANT SELECT
ON TABLE public.build_outcomes
TO authenticated;
