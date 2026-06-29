-- Movie / film / series production schema

CREATE TABLE IF NOT EXISTS public.series_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  series_bible JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.video_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  series_id UUID REFERENCES public.series_projects(id) ON DELETE SET NULL,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  screenplay JSONB,
  audio_tracks JSONB DEFAULT '[]',
  final_video_url TEXT,
  final_video_4k_url TEXT,
  scene_count INTEGER DEFAULT 0,
  duration_seconds INTEGER DEFAULT 5,
  providers_used TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.video_jobs(id) ON DELETE CASCADE,
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.video_jobs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  face_image_url TEXT,
  voice_id TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.audio_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id TEXT,
  character_id UUID REFERENCES public.characters(id) ON DELETE SET NULL,
  dialogue TEXT,
  audio_url TEXT,
  timestamp_ms INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_jobs_status ON public.video_jobs(status);
CREATE INDEX IF NOT EXISTS idx_video_jobs_user_id ON public.video_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_series_projects_user_id ON public.series_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_characters_project_id ON public.characters(project_id);
CREATE INDEX IF NOT EXISTS idx_audio_tracks_scene_id ON public.audio_tracks(scene_id);

-- Movie agent prompts in orchestrator_config
INSERT INTO orchestrator_config (id, system_prompt, version)
VALUES (
  'movie_architect',
  'You are the XROGA Architect for film production. Decompose the user request into a script, character design, storyboard, scene generation, audio, and post-production. Output a JSON with analysis, scriptOutline, characterRequirements, sceneCount, estimatedDuration, priority (critical for hero scenes, low for filler). Always include a fallbackPlan that uses ComfyUI and Tortoise if paid APIs fail.',
  1
)
ON CONFLICT (id) DO UPDATE SET system_prompt = EXCLUDED.system_prompt, version = EXCLUDED.version, updated_at = NOW();

INSERT INTO orchestrator_config (id, system_prompt, version)
VALUES (
  'movie_scriptwriter',
  'You are XROGA Scriptwriter. Write a complete script with scene headers, action lines, and character dialogues. Use a JSON structure: { scenes: [{ scene_id, location, characters, dialogue, action, durationSeconds, priority }] }. The output must be in markdown for easy parsing.',
  1
)
ON CONFLICT (id) DO UPDATE SET system_prompt = EXCLUDED.system_prompt, version = EXCLUDED.version, updated_at = NOW();

INSERT INTO orchestrator_config (id, system_prompt, version)
VALUES (
  'movie_scene_renderer',
  'You are XROGA Scene Renderer. Generate a 5-second video clip for the given scene description. Prioritise physics, lighting, and character consistency. If using Luma/Runway, set motion to smooth and cfg to 7. If using cheap APIs, reduce quality but ensure correct subject.',
  1
)
ON CONFLICT (id) DO UPDATE SET system_prompt = EXCLUDED.system_prompt, version = EXCLUDED.version, updated_at = NOW();

INSERT INTO orchestrator_config (id, system_prompt, version)
VALUES (
  'movie_quality_controller',
  'You are XROGA Quality Controller. Analyse the generated clip for physics glitches, object warping, and motion smoothness. Score 0-100. If score < 70, trigger Debugger to re-render with modified prompt.',
  1
)
ON CONFLICT (id) DO UPDATE SET system_prompt = EXCLUDED.system_prompt, version = EXCLUDED.version, updated_at = NOW();

INSERT INTO orchestrator_config (id, system_prompt, version)
VALUES (
  'movie_editor',
  'You are XROGA Editor. Collect all clips, sync audio tracks, add transitions, apply colour grading, and export to MP4 using FFmpeg. Upload to R2 and update Supabase.',
  1
)
ON CONFLICT (id) DO UPDATE SET system_prompt = EXCLUDED.system_prompt, version = EXCLUDED.version, updated_at = NOW();

-- Extended video provider priority chain
INSERT INTO api_priority_config (id, api_type, providers)
VALUES (
  'video_gen',
  'video',
  '["agnes","kling","fal","hailuo","runway","luma","replicate-svd","slideshow"]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET providers = EXCLUDED.providers, updated_at = NOW();
