-- Tier 0 HF Spaces first in video provider chain
INSERT INTO api_priority_config (id, api_type, providers)
VALUES (
  'video_gen',
  'video',
  '[
    "hf-spaces",
    "deepinfra","agnes","comfyui",
    "replicate-wan","zeroscope","ltx-video","videocrafter","animatediff",
    "allegro","kandinsky","mochi","cogvideox","open-sora","pyramid-flow",
    "hunyuan","skyreels","ovi","replicate-svd","replicate-minimax",
    "fal","hailuo","kling","luma","luma-replicate","runway","morph",
    "slideshow"
  ]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET providers = EXCLUDED.providers, updated_at = NOW();
