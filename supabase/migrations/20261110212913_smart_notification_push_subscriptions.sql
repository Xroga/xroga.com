-- Push endpoints are private server-side delivery credentials, never a browser-readable table.
CREATE TABLE IF NOT EXISTS public.notification_push_subscriptions (
  endpoint text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  p256dh text NOT NULL,
  auth_secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_push_endpoint_length CHECK (length(endpoint) BETWEEN 32 AND 2048),
  CONSTRAINT notification_push_key_length CHECK (length(p256dh) BETWEEN 40 AND 256 AND length(auth_secret) BETWEEN 8 AND 256)
);

CREATE INDEX IF NOT EXISTS notification_push_subscriptions_user_id_idx
  ON public.notification_push_subscriptions (user_id);

ALTER TABLE public.notification_push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_push_subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_push_subscriptions TO service_role;
