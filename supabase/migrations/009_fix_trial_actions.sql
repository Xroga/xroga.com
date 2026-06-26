-- Ensure all unpaid users have 50 free trial actions
UPDATE public.user_actions
SET
  total_actions = 50,
  used_actions = LEAST(COALESCE(used_actions, 0), 50),
  plan_tier = 'unpaid',
  concurrency_limit = 1
WHERE plan_tier IN ('unpaid', 'spark') AND (total_actions < 50 OR total_actions > 100);
