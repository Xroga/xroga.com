-- Update image provider priority: Agnes AI primary, Fal/Replicate/Cloudflare fallbacks

UPDATE api_priority_config
SET
  providers = '["agnes-image","fal-sdxl","replicate-sd","cloudflare"]'::jsonb,
  updated_at = now()
WHERE id = 'image_gen';

INSERT INTO api_priority_config (id, api_type, providers)
VALUES (
  'image_gen',
  'image',
  '["agnes-image","fal-sdxl","replicate-sd","cloudflare"]'::jsonb
)
ON CONFLICT (id) DO NOTHING;
