-- Concurrency limits per plan + 50-action free trial
ALTER TABLE public.user_actions ADD COLUMN IF NOT EXISTS concurrency_limit INTEGER DEFAULT 1;

UPDATE public.user_actions
SET concurrency_limit = CASE plan_tier
  WHEN 'spark' THEN 2
  WHEN 'nova' THEN 5
  WHEN 'zenith' THEN 30
  WHEN 'singularity' THEN 100
  WHEN 'pulse' THEN 2
  ELSE 1
END
WHERE concurrency_limit IS NULL OR concurrency_limit = 1;

-- Free trial: 50 actions for unpaid users
UPDATE public.user_actions
SET total_actions = 50, plan_tier = 'unpaid', concurrency_limit = 1
WHERE plan_tier IN ('spark', 'unpaid') AND total_actions <= 10;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_actions (user_id, plan_tier, total_actions, used_actions, concurrency_limit)
  VALUES (NEW.id, 'unpaid', 50, 0, 1)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
