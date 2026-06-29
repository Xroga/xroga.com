-- XROGA Swarm resilience: internal error logs, response cache, API priorities, deployments

CREATE TABLE IF NOT EXISTS system_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  api TEXT,
  error_message TEXT NOT NULL,
  fallback_used TEXT,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT,
  run_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_system_errors_timestamp ON system_errors(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_system_errors_user ON system_errors(user_id);

CREATE TABLE IF NOT EXISTS response_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT NOT NULL UNIQUE,
  prompt_hash TEXT NOT NULL,
  response_text TEXT NOT NULL,
  feature_category TEXT,
  ttl_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_response_cache_key ON response_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_response_cache_expires ON response_cache(ttl_expires_at);

CREATE TABLE IF NOT EXISTS api_priority_config (
  id TEXT PRIMARY KEY,
  api_type TEXT NOT NULL,
  providers JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deployment_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  run_id UUID,
  target TEXT NOT NULL CHECK (target IN ('vercel', 'fly', 'github')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'deploying', 'deployed', 'failed')),
  method TEXT,
  url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orchestrator_config (
  id TEXT PRIMARY KEY DEFAULT 'master',
  system_prompt TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS swarm_job_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  project_id UUID,
  feature_category TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  bull_job_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE system_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE response_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployment_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE swarm_job_queue ENABLE ROW LEVEL SECURITY;

-- Service role only for internal tables (no user-facing policies)
CREATE POLICY "service_role_system_errors" ON system_errors FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_response_cache" ON response_cache FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_deployment_status" ON deployment_status FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_swarm_job_queue" ON swarm_job_queue FOR ALL USING (auth.role() = 'service_role');

INSERT INTO orchestrator_config (id, system_prompt, version)
VALUES (
  'master',
  'You are the XROGA Swarm Orchestrator (Black Hole V∞). Your primary duty is to fulfill user requests with zero visible errors. All external API calls must use retry logic with fallback chains. Never expose failure messages to the user; always return a best-effort answer using cached data, cheaper models, or helpful heuristics when needed. Route through Architect, Builder, Reviewer, QA, Debugger, and Automation Runtime as appropriate. Always invoke the 3-Tier Shield before final output. Append pros, cons, and next steps to every substantive response. If an API fails or credits are exhausted, quietly switch to the next provider in the priority list and log internally only.',
  1
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO api_priority_config (id, api_type, providers) VALUES
  ('llm_text', 'llm', '["openai-gpt4o","anthropic-claude-3.5","deepseek-v3","groq-llama3","gemini-pro","gemini-flash"]'::jsonb),
  ('image_gen', 'image', '["luma","fal-sdxl","replicate-sd","hailuo"]'::jsonb),
  ('video_gen', 'video', '["runway","luma","kling","hailuo"]'::jsonb),
  ('voice_tts', 'voice', '["elevenlabs","cartesia","fish-audio","google-tts"]'::jsonb),
  ('search_web', 'search', '["tavily","exa","newsapi"]'::jsonb)
ON CONFLICT (id) DO NOTHING;
