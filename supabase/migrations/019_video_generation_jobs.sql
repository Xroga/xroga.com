-- Background video generation jobs (survive tab close)
CREATE TABLE IF NOT EXISTS video_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  progress JSONB DEFAULT '{}',
  output JSONB,
  metadata JSONB DEFAULT '{}',
  estimated_seconds INTEGER DEFAULT 120,
  keyframe_url TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_video_jobs_user_status ON video_generation_jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_video_jobs_created ON video_generation_jobs(created_at DESC);

ALTER TABLE video_generation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own video jobs" ON video_generation_jobs
  FOR SELECT USING (auth.uid() = user_id);
