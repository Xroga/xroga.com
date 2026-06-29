UPDATE api_priority_config
SET
  providers = '["openai-dalle","agnes-image","fal-sdxl","replicate-sd","cloudflare"]'::jsonb,
  updated_at = now()
WHERE id = 'image_gen';
