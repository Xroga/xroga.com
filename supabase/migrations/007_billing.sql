-- Billing: optional Paddle customer ID on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS paddle_customer_id TEXT;

-- Ensure free trial defaults for new users
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_actions (user_id, plan_tier, total_actions, used_actions)
  VALUES (NEW.id, 'unpaid', 10, 0)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT ALL ON TABLE public.user_actions TO service_role;
