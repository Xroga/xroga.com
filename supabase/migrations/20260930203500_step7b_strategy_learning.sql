-- Step 7B completion
-- Add privacy-safe engineering outcome dimensions used by bounded strategy learning.
--
-- No prompt, message, source, file content, diff, log, secret, environment value,
-- model reasoning, or arbitrary free-form error text is stored here.

ALTER TABLE public.build_outcomes
  ALTER COLUMN schema_version SET DEFAULT '1.1.0';

ALTER TABLE public.build_outcomes
  DROP CONSTRAINT IF EXISTS build_outcomes_failure_category_check;

ALTER TABLE public.build_outcomes
  ADD CONSTRAINT build_outcomes_failure_category_check
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
      'dependency',
      'runtime',
      'architecture',
      'integration',
      'user_configuration',
      'unknown'
    )
  );

ALTER TABLE public.build_outcomes
  ADD COLUMN IF NOT EXISTS failure_domain TEXT,
  ADD COLUMN IF NOT EXISTS failure_stage TEXT,
  ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS taxonomy_id TEXT,
  ADD COLUMN IF NOT EXISTS product_surface TEXT,
  ADD COLUMN IF NOT EXISTS product_subtype TEXT,
  ADD COLUMN IF NOT EXISTS domain_category TEXT,
  ADD COLUMN IF NOT EXISTS recipe_id TEXT,
  ADD COLUMN IF NOT EXISTS golden_example_ids TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS framework TEXT,
  ADD COLUMN IF NOT EXISTS runtime TEXT,
  ADD COLUMN IF NOT EXISTS adapter_id TEXT,
  ADD COLUMN IF NOT EXISTS generated_file_count INTEGER,
  ADD COLUMN IF NOT EXISTS verification_attempts INTEGER,
  ADD COLUMN IF NOT EXISTS repair_rounds INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS build_passed BOOLEAN,
  ADD COLUMN IF NOT EXISTS test_passed BOOLEAN,
  ADD COLUMN IF NOT EXISTS browser_passed BOOLEAN,
  ADD COLUMN IF NOT EXISTS runtime_passed BOOLEAN,
  ADD COLUMN IF NOT EXISTS saved_project_ready BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS publication_requested BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS publication_succeeded BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deployment_requested BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deployment_succeeded BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS learning_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS learning_exclusion_reason TEXT,
  ADD COLUMN IF NOT EXISTS learning_decision JSONB;

ALTER TABLE public.build_outcomes
  DROP CONSTRAINT IF EXISTS build_outcomes_failure_domain_check;

ALTER TABLE public.build_outcomes
  ADD CONSTRAINT build_outcomes_failure_domain_check
  CHECK (
    failure_domain IS NULL
    OR failure_domain IN (
      'none',
      'project',
      'provider',
      'platform',
      'user',
      'delivery'
    )
  );

ALTER TABLE public.build_outcomes
  DROP CONSTRAINT IF EXISTS build_outcomes_failure_stage_check;

ALTER TABLE public.build_outcomes
  ADD CONSTRAINT build_outcomes_failure_stage_check
  CHECK (
    failure_stage IS NULL
    OR failure_stage IN (
      'none',
      'planning',
      'implementation',
      'dependency',
      'build',
      'test',
      'browser',
      'runtime',
      'verification',
      'publication',
      'deployment',
      'unknown'
    )
  );

ALTER TABLE public.build_outcomes
  DROP CONSTRAINT IF EXISTS build_outcomes_generated_file_count_check;

ALTER TABLE public.build_outcomes
  ADD CONSTRAINT build_outcomes_generated_file_count_check
  CHECK (
    generated_file_count IS NULL
    OR generated_file_count >= 0
  );

ALTER TABLE public.build_outcomes
  DROP CONSTRAINT IF EXISTS build_outcomes_verification_attempts_check;

ALTER TABLE public.build_outcomes
  ADD CONSTRAINT build_outcomes_verification_attempts_check
  CHECK (
    verification_attempts IS NULL
    OR verification_attempts >= 0
  );

ALTER TABLE public.build_outcomes
  DROP CONSTRAINT IF EXISTS build_outcomes_repair_rounds_check;

ALTER TABLE public.build_outcomes
  ADD CONSTRAINT build_outcomes_repair_rounds_check
  CHECK (
    repair_rounds >= 0
  );

CREATE INDEX IF NOT EXISTS
  idx_build_outcomes_product_context
ON public.build_outcomes(
  taxonomy_id,
  product_surface,
  product_subtype,
  updated_at DESC
);

CREATE INDEX IF NOT EXISTS
  idx_build_outcomes_recipe
ON public.build_outcomes(
  recipe_id,
  updated_at DESC
);

CREATE INDEX IF NOT EXISTS
  idx_build_outcomes_learning_eligible
ON public.build_outcomes(
  learning_eligible,
  updated_at DESC
);

-- Learning memory is internal quality infrastructure. Client applications do not
-- read or write this table directly. Production code uses the service role.
DROP POLICY IF EXISTS
  "Users read own build outcomes"
ON public.build_outcomes;

REVOKE ALL
ON TABLE public.build_outcomes
FROM anon, authenticated;

GRANT ALL
ON TABLE public.build_outcomes
TO service_role;

ALTER TABLE public.build_outcomes
ENABLE ROW LEVEL SECURITY;
