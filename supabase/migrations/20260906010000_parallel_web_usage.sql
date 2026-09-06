-- Xroga public-web intelligence accounting.
--
-- Costs are internal and are intentionally NOT exposed as user-facing
-- request counters or provider quotas.

CREATE TABLE IF NOT EXISTS public.xroga_web_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  cycle_id UUID
    REFERENCES public.xroga_billing_cycles(id)
    ON DELETE SET NULL,

  user_id UUID NOT NULL
    REFERENCES auth.users(id)
    ON DELETE CASCADE,

  provider TEXT NOT NULL
    CHECK (provider IN ('parallel', 'xai')),

  operation TEXT NOT NULL
    CHECK (
      operation IN (
        'parallel_extract',
        'parallel_search_turbo',
        'parallel_responses_low',
        'parallel_responses_medium',
        'grok_x_search'
      )
    ),

  price_version TEXT NOT NULL,

  actual_micro_usd BIGINT NOT NULL
    CHECK (actual_micro_usd >= 0),

  provider_request_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS xroga_web_usage_user_created_idx
  ON public.xroga_web_usage (
    user_id,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS xroga_web_usage_cycle_created_idx
  ON public.xroga_web_usage (
    cycle_id,
    created_at DESC
  );

ALTER TABLE public.xroga_web_usage
  ENABLE ROW LEVEL SECURITY;

-- Provider/cost metadata stays internal.
REVOKE ALL
  ON public.xroga_web_usage
  FROM anon, authenticated;

GRANT ALL
  ON public.xroga_web_usage
  TO service_role;
