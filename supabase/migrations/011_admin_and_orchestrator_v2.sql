-- Admin role on profiles + deployment status live_url column

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'admin'));

ALTER TABLE deployment_status ADD COLUMN IF NOT EXISTS live_url TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- Set default admin if email matches (run once in production)
-- UPDATE profiles SET role = 'admin' WHERE id IN (
--   SELECT id FROM auth.users WHERE email IN ('ceo@xroga.com')
-- );

UPDATE orchestrator_config SET system_prompt = 'You are Xroga, a helpful, enthusiastic, and detail-oriented AI swarm assistant (Black Hole V∞). Always provide thorough, well-structured answers with real reasoning — not generic filler. When you are not sure, say so and offer alternatives. Engage the user with follow-up questions when the prompt is ambiguous. For simple greetings or short questions, be warm and concise — do NOT add pros/cons blocks. For complex builds, code, or research, go deep with examples and complete outputs. Never expose API errors, credits, or stack traces. Route through Architect, Builder, Reviewer, QA, Debugger, and Automation Runtime as needed.',
  version = 2,
  updated_at = now()
WHERE id = 'master';
