-- Production schema fix: core Swarm tables + service_role grants
-- Run in Supabase SQL Editor: https://supabase.com/dashboard → SQL → New query

-- Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  timezone TEXT DEFAULT 'UTC',
  language TEXT DEFAULT 'en',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Projects (swarm_runs.project_id FK)
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'app',
  status TEXT DEFAULT 'in_progress',
  actions_used INTEGER DEFAULT 0,
  github_repo_url TEXT,
  github_repo_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User actions (fuel meter)
CREATE TABLE IF NOT EXISTS public.user_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  plan_tier TEXT DEFAULT 'spark',
  total_actions INTEGER NOT NULL DEFAULT 2000,
  used_actions INTEGER DEFAULT 0,
  reset_date TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activity log
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Action transactions
CREATE TABLE IF NOT EXISTS public.action_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  task_type TEXT NOT NULL,
  actions_cost INTEGER NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Swarm task runs (required for /api/swarm/execute)
CREATE TABLE IF NOT EXISTS public.swarm_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  prompt TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  current_agent TEXT,
  iteration_count INTEGER DEFAULT 0,
  defects_found INTEGER DEFAULT 0,
  output JSONB,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_swarm_runs_user_id ON public.swarm_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swarm_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can view own projects" ON public.projects;
CREATE POLICY "Users can view own projects" ON public.projects FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own projects" ON public.projects;
CREATE POLICY "Users can insert own projects" ON public.projects FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own actions" ON public.user_actions;
CREATE POLICY "Users can view own actions" ON public.user_actions FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own activity" ON public.activity_logs;
CREATE POLICY "Users can view own activity" ON public.activity_logs FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own activity" ON public.activity_logs;
CREATE POLICY "Users can insert own activity" ON public.activity_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own swarm runs" ON public.swarm_runs;
CREATE POLICY "Users can view own swarm runs" ON public.swarm_runs FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own swarm runs" ON public.swarm_runs;
CREATE POLICY "Users can insert own swarm runs" ON public.swarm_runs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Service role bypasses RLS but still needs table grants
GRANT ALL ON TABLE public.profiles TO service_role;
GRANT ALL ON TABLE public.projects TO service_role;
GRANT ALL ON TABLE public.user_actions TO service_role;
GRANT ALL ON TABLE public.activity_logs TO service_role;
GRANT ALL ON TABLE public.action_transactions TO service_role;
GRANT ALL ON TABLE public.swarm_runs TO service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.projects TO authenticated;
GRANT SELECT ON TABLE public.user_actions TO authenticated;
GRANT SELECT, INSERT ON TABLE public.activity_logs TO authenticated;
GRANT SELECT, INSERT ON TABLE public.swarm_runs TO authenticated;
