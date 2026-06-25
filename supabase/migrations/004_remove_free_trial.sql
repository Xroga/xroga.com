-- Remove free trial: new users start unpaid until they subscribe

ALTER TABLE user_actions DROP CONSTRAINT IF EXISTS user_actions_subscription_status_check;
ALTER TABLE user_actions ADD CONSTRAINT user_actions_subscription_status_check
  CHECK (subscription_status IN ('unpaid', 'active', 'past_due', 'canceled', 'expired'));

-- Update signup trigger: no free actions until paid plan
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name, onboarding_completed)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), FALSE);

  INSERT INTO user_actions (
    user_id, plan_tier, total_actions, used_actions,
    subscription_status, is_trial, trial_expires_at, reset_date
  )
  VALUES (NEW.id, 'spark', 0, 0, 'unpaid', FALSE, NULL, NOW() + INTERVAL '30 days');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
