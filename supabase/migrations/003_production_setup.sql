-- Production setup: starter actions, avatars bucket, missing-row safety

-- Allow unpaid tier for users without subscription
ALTER TABLE user_actions DROP CONSTRAINT IF EXISTS user_actions_plan_tier_check;
ALTER TABLE user_actions ADD CONSTRAINT user_actions_plan_tier_check
  CHECK (plan_tier IN ('unpaid', 'spark', 'pulse', 'nova', 'zenith', 'singularity'));

-- New signups: profile + 10 starter actions (enough to test chat)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO user_actions (user_id, plan_tier, total_actions, used_actions)
  VALUES (NEW.id, 'spark', 10, 0)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Backfill missing rows for existing auth users
INSERT INTO profiles (id, display_name)
SELECT u.id, COALESCE(u.raw_user_meta_data->>'full_name', u.email)
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_actions (user_id, plan_tier, total_actions, used_actions)
SELECT u.id, 'spark', 10, 0
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM user_actions a WHERE a.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;

-- Avatars storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;

CREATE POLICY "Avatar images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
