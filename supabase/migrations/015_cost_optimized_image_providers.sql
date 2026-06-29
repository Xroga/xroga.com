-- Cost-optimized image provider priority: Fal primary, no OpenAI DALL-E

UPDATE api_priority_config
SET
  providers = '["fal-sdxl","replicate-sd","agnes-image","luma-image","runway-image","hailuo-image","cloudflare","comfyui"]'::jsonb,
  updated_at = now()
WHERE id = 'image_gen';

INSERT INTO api_priority_config (id, api_type, providers)
VALUES (
  'image_gen',
  'image',
  '["fal-sdxl","replicate-sd","agnes-image","luma-image","runway-image","hailuo-image","cloudflare","comfyui"]'::jsonb
)
ON CONFLICT (id) DO NOTHING;
