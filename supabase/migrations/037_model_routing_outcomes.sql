CREATE TABLE IF NOT EXISTS public.model_routing_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_class TEXT NOT NULL,
  model_id TEXT NOT NULL,
  routing_mode TEXT NOT NULL CHECK (routing_mode IN ('intelligence', 'balanced', 'cost')),
  latency_ms INTEGER,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(12, 6),
  patch_applied BOOLEAN,
  typecheck_ok BOOLEAN,
  test_ok BOOLEAN,
  build_ok BOOLEAN,
  preview_ok BOOLEAN,
  repair_loops INTEGER NOT NULL DEFAULT 0,
  model_switches INTEGER NOT NULL DEFAULT 0,
  recovery_succeeded BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_model_routing_outcomes_model_task
  ON public.model_routing_outcomes(model_id, task_class, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_model_routing_outcomes_user
  ON public.model_routing_outcomes(user_id, created_at DESC);

ALTER TABLE public.model_routing_outcomes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'model_routing_outcomes'
      AND policyname = 'Users read own routing outcomes'
  ) THEN
    CREATE POLICY "Users read own routing outcomes"
      ON public.model_routing_outcomes FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

GRANT ALL ON TABLE public.model_routing_outcomes TO service_role;
GRANT SELECT ON TABLE public.model_routing_outcomes TO authenticated;
