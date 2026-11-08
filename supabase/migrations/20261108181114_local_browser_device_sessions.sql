-- Browser device grants are written only by the backend's existing PostgreSQL connection.
-- Store digests, never an extension credential or a Workspace access token.
CREATE TABLE public.local_browser_device_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  extension_id text NOT NULL CHECK (extension_id ~ '^[a-p]{32}$'),
  challenge text NOT NULL,
  code_hash text UNIQUE,
  device_hash text,
  access_hash text UNIQUE,
  expires_at timestamptz NOT NULL,
  access_expires_at timestamptz,
  UNIQUE (owner_id, challenge),
  CHECK (
    (code_hash IS NOT NULL AND device_hash IS NULL AND access_hash IS NULL AND access_expires_at IS NULL)
    OR
    (code_hash IS NULL AND device_hash IS NOT NULL AND access_hash IS NOT NULL AND access_expires_at IS NOT NULL)
  )
);

ALTER TABLE public.local_browser_device_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.local_browser_device_sessions FROM PUBLIC, anon, authenticated, service_role;
CREATE INDEX local_browser_device_sessions_expiry_idx ON public.local_browser_device_sessions (expires_at);
